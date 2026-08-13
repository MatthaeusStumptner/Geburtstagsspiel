const DIRECTION_NAMES = new Set(['up', 'right', 'down', 'left']);

export class DirectionalSwipeInput {
  constructor({ activationDistance = 4, dominanceRatio = 1.08 } = {}) {
    this.activationDistance = Math.max(1, Number(activationDistance) || 4);
    this.dominanceRatio = Math.max(1, Number(dominanceRatio) || 1.08);
    this.cancel();
  }

  begin({ x, y, pointerId = 0 }) {
    this.pointerId = pointerId;
    this.anchorX = Number(x) || 0;
    this.anchorY = Number(y) || 0;
    this.lastDirection = '';
  }

  update({ x, y, pointerId = 0 }) {
    if (this.pointerId === null || pointerId !== this.pointerId) return null;
    const pointX = Number(x) || 0;
    const pointY = Number(y) || 0;
    const dx = pointX - this.anchorX;
    const dy = pointY - this.anchorY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (Math.max(horizontal, vertical) < this.activationDistance) return null;

    let direction = null;
    if (horizontal >= vertical * this.dominanceRatio) direction = dx > 0 ? 'right' : 'left';
    else if (vertical >= horizontal * this.dominanceRatio) direction = dy > 0 ? 'down' : 'up';
    if (!DIRECTION_NAMES.has(direction)) return null;

    this.anchorX = pointX;
    this.anchorY = pointY;
    if (direction === this.lastDirection) return null;
    this.lastDirection = direction;
    return direction;
  }

  end(point) {
    const direction = point ? this.update(point) : null;
    this.cancel();
    return direction;
  }

  cancel() {
    this.pointerId = null;
    this.anchorX = 0;
    this.anchorY = 0;
    this.lastDirection = '';
  }
}
