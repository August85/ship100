import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class Ship100View extends WatchUi.WatchFace {

    // True while the watch is in low-power (always-on / wrist down) mode
    private var _lowPower as Boolean = false;
    // True on AMOLED models, which need burn-in protection in always-on mode
    private var _burnIn as Boolean = false;

    function initialize() {
        WatchFace.initialize();
        var settings = System.getDeviceSettings();
        _burnIn = (settings has :requiresBurnInProtection) && settings.requiresBurnInProtection;
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var cy = h / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var clock = System.getClockTime();
        var timeStr = formatTime(clock);

        if (_lowPower && _burnIn) {
            // AMOLED always-on: keep lit pixels well under 10% and move the
            // text a little every minute so no pixel stays on for long.
            var dx = (clock.min % 5 - 2) * 8;
            var dy = ((clock.min / 5) % 5 - 2) * 8;
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx + dx, cy + dy, Graphics.FONT_NUMBER_MEDIUM, timeStr,
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        // Accent ring
        dc.setPenWidth(4);
        dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, cx - 4);

        // Date
        var info = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        var dateStr = Lang.format("$1$ $2$ $3$", [info.day_of_week, info.day, info.month]);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 0.22, Graphics.FONT_SMALL, dateStr.toUpper(),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Time
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy, Graphics.FONT_NUMBER_THAI_HOT, timeStr,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Steps and heart rate
        var steps = ActivityMonitor.getInfo().steps;
        var hr = Activity.getActivityInfo() != null ? Activity.getActivityInfo().currentHeartRate : null;
        var statsStr = Lang.format("$1$ steps   $2$ bpm", [
            steps != null ? steps : "--",
            hr != null ? hr : "--"
        ]);
        dc.drawText(cx, h * 0.74, Graphics.FONT_XTINY, statsStr,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Battery
        var battery = System.getSystemStats().battery;
        dc.setColor(battery < 20 ? Graphics.COLOR_RED : Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 0.85, Graphics.FONT_XTINY, battery.format("%d") + "%",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function formatTime(clock as System.ClockTime) as String {
        var hour = clock.hour;
        if (!System.getDeviceSettings().is24Hour) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        return Lang.format("$1$:$2$", [hour, clock.min.format("%02d")]);
    }

    // Wrist raised: full face
    function onExitSleep() as Void {
        _lowPower = false;
        WatchUi.requestUpdate();
    }

    // Wrist down: low-power face
    function onEnterSleep() as Void {
        _lowPower = true;
        WatchUi.requestUpdate();
    }
}
