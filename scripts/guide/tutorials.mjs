import fs from "node:fs";

// Authored metadata only. No private storage links or automatically discovered files.
export const tutorials = JSON.parse(fs.readFileSync(new URL("../../docs/guide/tutorials.json", import.meta.url), "utf8"));
export const tutorialForVideo = (href) => tutorials.find((lesson) => lesson.video === href);
export const tutorialForPage = (slug) => tutorials.find((lesson) => lesson.slug === slug);
export function durationLabel(seconds) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
