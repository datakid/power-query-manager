export const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 200 * 1024 * 1024,
  maxEntries: 20000,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxEntryBytes: 512 * 1024 * 1024,
  maxRatio: 200,
  ratioFloorBytes: 10 * 1024 * 1024,
  maxCfbSectors: 1 << 20,
  maxXmlDomBytes: 64 * 1024 * 1024,
  maxMDepth: 2000,
  maxRows: 1000000,
  timeoutMs: 30000,
  printRowLimit: 20000,
  printRowRefuse: 200000,
  maxModuleBytes: 4 * 1024 * 1024,
  maxVbaLineChars: 1023
});

export function withLimits(overrides) {
  return Object.freeze({ ...DEFAULT_LIMITS, ...(overrides || {}) });
}
