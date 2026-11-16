import { runChecks } from "./checks.js";
try { const log = runChecks(); console.log(log.join("\n")); console.log(`\n${log.length} checks pass`); }
catch (e) { console.error(e.message); process.exit(1); }
