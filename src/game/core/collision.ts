import type { Vec2 } from './math';

/**
 * Obstacles are rounded rectangles: an inner axis-aligned box expanded by a
 * corner radius (a Minkowski sum). This matches the rounded island art closely
 * and keeps every query a cheap point-to-box distance.
 */
export interface RoundedRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cornerRadius: number;
}

export interface Bounds {
  width: number;
  height: number;
}

interface ClosestPoint {
  dx: number;
  dy: number;
  distSq: number;
}

function closestToBox(x: number, y: number, rect: RoundedRect): ClosestPoint {
  const cx = x < rect.minX ? rect.minX : x > rect.maxX ? rect.maxX : x;
  const cy = y < rect.minY ? rect.minY : y > rect.maxY ? rect.maxY : y;
  const dx = x - cx;
  const dy = y - cy;
  return { dx, dy, distSq: dx * dx + dy * dy };
}

/** Signed-ish distance from a point to the rounded rect surface (negative inside). */
export function distanceToObstacle(x: number, y: number, rect: RoundedRect): number {
  const { distSq } = closestToBox(x, y, rect);
  if (distSq > 0) return Math.sqrt(distSq) - rect.cornerRadius;
  const inside = Math.min(x - rect.minX, rect.maxX - x, y - rect.minY, rect.maxY - y);
  return -inside - rect.cornerRadius;
}

export function circleOverlapsObstacle(x: number, y: number, radius: number, rect: RoundedRect): boolean {
  return distanceToObstacle(x, y, rect) < radius;
}

export function pointInsideAnyObstacle(x: number, y: number, obstacles: readonly RoundedRect[], padding = 0): boolean {
  for (const rect of obstacles) {
    if (distanceToObstacle(x, y, rect) < padding) return true;
  }
  return false;
}

/**
 * Pushes a circle out of an obstacle. Returns the correction applied, or null
 * when there is no overlap.
 */
export function resolveCircleVsObstacle(pos: Vec2, radius: number, rect: RoundedRect): Vec2 | null {
  const reach = radius + rect.cornerRadius;
  const { dx, dy, distSq } = closestToBox(pos.x, pos.y, rect);
  if (distSq >= reach * reach) return null;

  let nx: number;
  let ny: number;
  let depth: number;
  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
    depth = reach - dist;
  } else {
    // Centre is inside the inner box: exit through the nearest face.
    const left = pos.x - rect.minX;
    const right = rect.maxX - pos.x;
    const top = pos.y - rect.minY;
    const bottom = rect.maxY - pos.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) [nx, ny] = [-1, 0];
    else if (min === right) [nx, ny] = [1, 0];
    else if (min === top) [nx, ny] = [0, -1];
    else [nx, ny] = [0, 1];
    depth = min + reach;
  }
  pos.x += nx * depth;
  pos.y += ny * depth;
  return { x: nx * depth, y: ny * depth };
}

/** Resolves against every obstacle; returns true when any correction happened. */
export function resolveCircleVsObstacles(pos: Vec2, radius: number, obstacles: readonly RoundedRect[]): boolean {
  let collided = false;
  // Two passes handle a circle wedged between two neighbouring obstacles.
  for (let pass = 0; pass < 2; pass++) {
    for (const rect of obstacles) {
      if (resolveCircleVsObstacle(pos, radius, rect)) collided = true;
    }
  }
  return collided;
}

/** Keeps a circle fully inside the arena. Returns true when clamped. */
export function clampCircleToBounds(pos: Vec2, radius: number, bounds: Bounds): boolean {
  const x = Math.min(Math.max(pos.x, radius), bounds.width - radius);
  const y = Math.min(Math.max(pos.y, radius), bounds.height - radius);
  const clamped = x !== pos.x || y !== pos.y;
  pos.x = x;
  pos.y = y;
  return clamped;
}

export function isOutsideBounds(x: number, y: number, bounds: Bounds, margin = 0): boolean {
  return x < -margin || y < -margin || x > bounds.width + margin || y > bounds.height + margin;
}

/** Line of sight test by sampling the segment; adequate for the island sizes used. */
export function segmentBlocked(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  obstacles: readonly RoundedRect[],
  step = 16,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.sqrt(dx * dx + dy * dy);
  const samples = Math.max(1, Math.ceil(length / step));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    if (pointInsideAnyObstacle(ax + dx * t, ay + dy * t, obstacles)) return true;
  }
  return false;
}

export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}
