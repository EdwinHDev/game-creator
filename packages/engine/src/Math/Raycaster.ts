import { vec3, vec4, mat4 } from 'gl-matrix';

/**
 * Utility for converting 2D mouse coordinates to 3D Rays and intersecting them with planes.
 */
export function getRayFromCamera(
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number,
  viewProjMatrix: mat4
): { origin: vec3, direction: vec3 } {
  // 1. Convert to Normalized Device Coordinates (NDC) [-1 to 1]
  const x = (mouseX / canvasWidth) * 2 - 1;
  const y = -(mouseY / canvasHeight) * 2 + 1;

  // 2. Invert ViewProjection matrix
  const invVP = mat4.create();
  mat4.invert(invVP, viewProjMatrix);

  // 3. Get Near and Far points in clip space
  const nearClipping = vec4.fromValues(x, y, -1, 1);
  const farClipping = vec4.fromValues(x, y, 1, 1);

  // 4. Transform to world space
  const nearWorld = vec4.create();
  const farWorld = vec4.create();
  vec4.transformMat4(nearWorld, nearClipping, invVP);
  vec4.transformMat4(farWorld, farClipping, invVP);

  // 5. Perspective divide
  const origin = vec3.fromValues(nearWorld[0] / nearWorld[3], nearWorld[1] / nearWorld[3], nearWorld[2] / nearWorld[3]);
  const farPos = vec3.fromValues(farWorld[0] / farWorld[3], farWorld[1] / farWorld[3], farWorld[2] / farWorld[3]);

  // 6. Calculate normalized direction
  const direction = vec3.create();
  vec3.subtract(direction, farPos, origin);
  vec3.normalize(direction, direction);

  return { origin, direction };
}

/**
 * Calculates the intersection point of a ray and a plane.
 */
export function intersectRayPlane(
  rayOrigin: vec3,
  rayDir: vec3,
  planePoint: vec3,
  planeNormal: vec3
): vec3 | null {
  const denom = vec3.dot(planeNormal, rayDir);

  // Ray is nearly parallel to the plane
  if (Math.abs(denom) < 0.0001) return null;

  const p0l0 = vec3.create();
  vec3.subtract(p0l0, planePoint, rayOrigin);

  const t = vec3.dot(p0l0, planeNormal) / denom;

  // Intersection is behind the ray origin
  if (t < 0) return null;

  const hit = vec3.create();
  vec3.scaleAndAdd(hit, rayOrigin, rayDir, t);
  return hit;
}

/**
 * Simple calculation of distance between a Point and a Finite Line Segment.
 * Used for "picking" Gizmo axes. (Approximate helper)
 */
export function distancePointToSegment(p: vec3, a: vec3, b: vec3): number {
  const ab = vec3.create();
  vec3.subtract(ab, b, a);
  const ap = vec3.create();
  vec3.subtract(ap, p, a);
  const bp = vec3.create();
  vec3.subtract(bp, p, b);

  const e = vec3.dot(ap, ab);
  const f = vec3.dot(ab, ab);

  if (e <= 0) return vec3.distance(p, a);
  if (e >= f) return vec3.distance(p, b);

  return Math.sqrt(vec3.squaredDistance(p, a) - (e * e) / f);
}

/**
 * Closest distance between two infinite lines (untested/not strictly needed for segment hit).
 * Using distancePointToSegment is often enough for gizmos.
 */
