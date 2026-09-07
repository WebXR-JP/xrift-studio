/** Runs inside a Playwright page containing the generated offline gallery. */
module.exports = function runSkyWebglChecks() {
  const g = window.skyGallery;
  if (!g) throw new Error('Sky gallery was not loaded');
  const report = { qualityRenders: [], directionChecks: 0, boundaryChecks: 0, finiteChecks: 0, exposureChecks: 0, stoppedMotionChecks: 0, failures: [] };
  g.setSize(96, 60);
  function finite(label) {
    const result = g.checkFinite();
    report.finiteChecks++;
    if (!result.okay || result.invalid) report.failures.push({ label, ...result });
  }
  for (const e of g.entries) {
    for (const q of ['low', 'balanced', 'high']) {
      const okay = g.setQuality(q) && g.select(e.id);
      const stats = g.stats();
      report.qualityRenders.push({ id: e.id, quality: q, okay, ...stats });
      if (!okay || stats.max === 0) report.failures.push({ label: `${e.id}/${q}: empty or failed default render` });
      finite(`${e.id}/${q}/default`);
    }
    g.setQuality('balanced');
    const active = g.programFor(e, 'balanced').uniforms;
    for (const p of e.parameters) if (!active[p.uniform]) report.failures.push({ label: `${e.id}: inactive control ${p.uniform}` });
    for (const [az, el] of [[0, 0], [90, 0], [180, 0], [-90, 0], [0, 90], [0, -90]]) {
      g.setView(az, el);
      finite(`${e.id}/direction/${az}/${el}`);
      report.directionChecks++;
    }
    g.select(e.id);
    for (const p of e.parameters) {
      const uniform = e.shader.uniforms[p.uniform];
      const previous = uniform.value;
      for (const value of p.kind === 'number' ? [p.min, p.max] : ['#000000', '#ffffff']) {
        uniform.value = value;
        finite(`${e.id}/${p.uniform}=${value}`);
        report.boundaryChecks++;
      }
      uniform.value = previous;
    }
    const exposure = e.shader.uniforms.uExposure;
    const before = exposure.value;
    exposure.value = 0;
    g.draw();
    if (g.stats().max !== 0) report.failures.push({ label: `${e.id}: exposure zero did not produce black` });
    exposure.value = before;
    report.exposureChecks++;
    // The extended programs offer a common wind/effect speed. Twinkle is
    // independent and must also be stopped for an identical static image.
    if (e.shader.uniforms.uSpeed) {
      const speed = e.shader.uniforms.uSpeed;
      const twinkle = e.shader.uniforms.uTwinkleSpeed;
      const originalSpeed = speed.value;
      const originalTwinkle = twinkle?.value;
      speed.value = 0;
      if (twinkle) twinkle.value = 0;
      g.setTime(0); const frame = g.capture();
      g.setTime(30);
      if (g.capture() !== frame) report.failures.push({ label: `${e.id}: zero speed still animates` });
      speed.value = originalSpeed;
      if (twinkle) twinkle.value = originalTwinkle;
      report.stoppedMotionChecks++;
    }
  }
  report.compileErrors = g.errors;
  if (g.errors.length) report.failures.push(...g.errors);
  g.setQuality('balanced');
  g.select(g.entries[0].id);
  return report;
};
