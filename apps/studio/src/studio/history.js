const clone = (value) => JSON.parse(JSON.stringify(value));

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class StudioHistory {
  constructor({ limit = 80, coalesceWindow = 650 } = {}) {
    this.limit = limit;
    this.coalesceWindow = coalesceWindow;
    this.past = [];
    this.future = [];
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoLabel() { return this.past.at(-1)?.label ?? ''; }
  get redoLabel() { return this.future.at(-1)?.label ?? ''; }

  clear() {
    this.past = [];
    this.future = [];
  }

  record(label, beforeValue, afterValue, { key = label, now = Date.now(), coalesce = true } = {}) {
    const before = clone(beforeValue);
    const after = clone(afterValue);
    if (equal(before, after)) return false;
    const previous = this.past.at(-1);
    if (coalesce && previous?.key === key && now - previous.changedAt <= this.coalesceWindow) {
      previous.after = after;
      previous.changedAt = now;
    } else {
      this.past.push({ label, key, before, after, changedAt: now });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    return true;
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(entry);
    return { label: entry.label, snapshot: clone(entry.before) };
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push(entry);
    return { label: entry.label, snapshot: clone(entry.after) };
  }
}
