export class BrowserSaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  readJson(key) {
    try {
      const raw = this.storage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  readNumber(key, fallback = 0) {
    try {
      const value = Number(this.storage.getItem(key));
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  writeJson(key, value) {
    this.storage.setItem(key, JSON.stringify(value));
  }

  remove(...keys) {
    keys.forEach((key) => this.storage.removeItem(key));
  }
}
