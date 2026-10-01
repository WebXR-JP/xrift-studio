import test from "node:test";
import assert from "node:assert/strict";
import { matchesOtoguraAudioFilter } from "../src/lib/visual-editor/external-store-providers.ts";

test("published music categories, including vocal and unclassified tracks, use the music group", () => {
  for (const category of ["楽曲・BGM", "楽曲・歌入り", "楽曲・未分類"]) {
    const asset = { category, tags: [] };
    assert.equal(matchesOtoguraAudioFilter(asset, "music"), true);
    assert.equal(matchesOtoguraAudioFilter(asset, "sfx"), false);
    assert.equal(matchesOtoguraAudioFilter(asset, "all"), true);
  }
});

test("the provider's music tag is recognized without guessing from a filename", () => {
  const asset = { category: "新しいカテゴリ", tags: ["music"] };
  assert.equal(matchesOtoguraAudioFilter(asset, "music"), true);
  assert.equal(matchesOtoguraAudioFilter(asset, "sfx"), false);
});

test("effects and ambience stay in SFX even when names or prompts mention music", () => {
  const asset = { name: "music-box", description: "no music", category: "火", tags: ["loop", "火"] };
  assert.equal(matchesOtoguraAudioFilter(asset, "sfx"), true);
  assert.equal(matchesOtoguraAudioFilter(asset, "music"), false);
  assert.equal(matchesOtoguraAudioFilter(asset, "all"), true);
});
