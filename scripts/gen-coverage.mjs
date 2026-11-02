import { writeFileSync } from 'node:fs';
import { coverageDocument } from '../src/core/m/coverage.js';

writeFileSync('docs/m-coverage.md', coverageDocument());
console.log('docs/m-coverage.md written');
