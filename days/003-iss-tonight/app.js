// ISS Tonight: Day 3 of Ship 100.
// Plain ES module, no build step. Pin any CDN import to an exact version.
// Wrap localStorage in try/catch; never put API keys in this file.

const app = document.querySelector("#app");
app.textContent = "Hello from day 3.";
