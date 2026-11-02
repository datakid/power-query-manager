import { runAll, printFindings } from './checks.js';

const findings = runAll();
printFindings(findings);
console.log(`${findings.length} findings`);
process.exit(findings.length ? 1 : 0);
