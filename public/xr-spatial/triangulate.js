/** Ear clipping for a simple WebXR plane polygon (local X/Z, +Y normal). */
export function triangulatePlane(points) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  const ring = points.map((_, i) => i);
  if (points.length > 2 && points[0].every((v, i) => v === points.at(-1)[i])) ring.pop();
  const area = ring.reduce((sum, i, j) => { const next = points[ring[(j + 1) % ring.length]]; return sum + points[i][0] * next[2] - next[0] * points[i][2]; }, 0);
  if (area < 0) ring.reverse();
  const triangles = [];
  while (ring.length > 3) {
    let found = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
      if (Math.abs(cross(points[a], points[b], points[c])) < 1e-10) { ring.splice(i, 1); found = true; break; }
      if (cross(points[a], points[b], points[c]) < 0) continue;
      const inside = ring.some(j => j !== a && j !== b && j !== c && cross(points[a], points[b], points[j]) >= -1e-10 && cross(points[b], points[c], points[j]) >= -1e-10 && cross(points[c], points[a], points[j]) >= -1e-10);
      if (inside) continue;
      triangles.push(a, c, b); // +Y normal
      ring.splice(i, 1); found = true; break;
    }
    if (!found) throw new Error('Plane polygonを三角形化できません');
  }
  if (ring.length === 3) triangles.push(ring[0], ring[2], ring[1]);
  return triangles;
}
