export class QuoinError extends Error {
  constructor(code, detail, part) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'QuoinError';
    this.code = code;
    this.detail = detail || '';
    this.part = part || '';
  }
}

export const isQuoinError = (e) => e instanceof QuoinError;
