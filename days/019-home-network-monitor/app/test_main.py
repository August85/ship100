"""Run: python3 -m unittest test_main  (from the app/ folder)"""
import tempfile
import unittest

import main

IP_NEIGH = """192.168.1.1 dev wlan0 lladdr b0:be:76:12:34:01 REACHABLE
192.168.1.20 dev wlan0 lladdr F0:18:98:3E:71:0C STALE
192.168.1.99 dev wlan0  INCOMPLETE
192.168.1.98 dev wlan0  FAILED
fe80::1 dev wlan0 lladdr b0:be:76:12:34:01 router REACHABLE
"""

ARP_AN = """? (192.168.1.1) at b0:be:76:12:34:1 on en0 ifscope [ethernet]
? (192.168.1.31) at 5c:aa:fd:8e:1:42 on en0 ifscope [ethernet]
? (192.168.1.44) at (incomplete) on en0 ifscope [ethernet]
? (192.168.1.255) at ff:ff:ff:ff:ff:ff on en0 ifscope [ethernet]
? (224.0.0.251) at 1:0:5e:0:0:fb on en0 ifscope permanent [ethernet]
"""


class Parse(unittest.TestCase):
    def test_ip_neigh(self):
        self.assertEqual(main.parse_neighbors(IP_NEIGH), {
            "b0:be:76:12:34:01": "192.168.1.1",
            "f0:18:98:3e:71:0c": "192.168.1.20",
        })

    def test_arp_an_short_octets_and_broadcast(self):
        self.assertEqual(main.parse_neighbors(ARP_AN), {
            "b0:be:76:12:34:01": "192.168.1.1",
            "5c:aa:fd:8e:01:42": "192.168.1.31",
        })


class Vendors(unittest.TestCase):
    def test_private_mac(self):
        self.assertTrue(main.is_random_mac("da:42:9e:11:7a:55"))
        self.assertFalse(main.is_random_mac("f0:18:98:3e:71:0c"))
        self.assertEqual(main.vendor_for("da:42:9e:11:7a:55"), "Private address (phone/laptop)")

    def test_lookup_and_override(self):
        self.assertEqual(main.vendor_for("dc:a6:32:00:00:01"), "Raspberry Pi")
        self.assertEqual(main.vendor_for("00:aa:bb:00:00:01"), "Unknown vendor")
        self.assertEqual(main.vendor_for("00:aa:bb:00:00:01", {"00:aa:bb": "Mine"}), "Mine")


class Merge(unittest.TestCase):
    def test_new_and_gone(self):
        known, new, gone = main.merge({}, {"aa:00:00:00:00:01": "10.0.0.2"}, 100)
        self.assertEqual(new, ["aa:00:00:00:00:01"])
        known, new, gone = main.merge(known, {"00:00:00:00:00:02": "10.0.0.3"}, 200)
        self.assertEqual(new, ["00:00:00:00:00:02"])
        self.assertEqual(gone, ["aa:00:00:00:00:01"])
        self.assertFalse(known["aa:00:00:00:00:01"]["online"])
        known, new, gone = main.merge(known, {"aa:00:00:00:00:01": "10.0.0.9", "00:00:00:00:00:02": "10.0.0.3"}, 300)
        self.assertEqual((new, gone), ([], []))
        self.assertEqual(known["aa:00:00:00:00:01"]["ip"], "10.0.0.9")
        self.assertEqual(known["aa:00:00:00:00:01"]["first_seen"], 100)


class EndToEnd(unittest.TestCase):
    def test_mock_story(self):
        with tempfile.TemporaryDirectory() as d:
            store = main.Store(d)
            net = main.MockNetwork(store.dir)
            _, new, _ = main.scan_once(net, store)        # baseline, no alerts
            self.assertEqual(len(new), 9)
            _, new, gone = main.scan_once(net, store)     # phone naps
            self.assertEqual((new, gone), ([], ["da:42:9e:11:7a:55"]))
            _, new, _ = main.scan_once(net, store)        # stranger joins
            self.assertEqual(new, ["d8:f1:5b:0c:4e:91"])
            page = (store.dir / "devices.html").read_text()
            self.assertIn("Espressif", page)
            self.assertIn(">New<", page)


if __name__ == "__main__":
    unittest.main()
