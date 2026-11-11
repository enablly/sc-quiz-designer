import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateQuizDefinition } from "../src/domain/validator.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";

const seed = loadSeedDefinition();

describe("Acceptance Test 4: Definition validator", () => {
  it("accepts the seed definition", () => {
    const res = validateQuizDefinition(seed);
    assert.equal(res.valid, true);
    assert.deepEqual(res.errors, []);
  });

  it("rejects duplicate question ids", () => {
    const bad = structuredClone(seed);
    bad.scoredQuestions[1]!.id = bad.scoredQuestions[0]!.id;
    const res = validateQuizDefinition(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /duplicate question id/i.test(e)));
  });

  it("rejects band gaps and overlaps", () => {
    const gap = structuredClone(seed);
    gap.scoring.bands[1]!.min = 42; // gap between 39 and 42
    const gapRes = validateQuizDefinition(gap);
    assert.equal(gapRes.valid, false);
    assert.ok(gapRes.errors.some((e) => /gap/i.test(e)));

    const overlap = structuredClone(seed);
    overlap.scoring.bands[1]!.min = 38; // overlaps 0-39
    const overlapRes = validateQuizDefinition(overlap);
    assert.equal(overlapRes.valid, false);
    assert.ok(overlapRes.errors.some((e) => /overlap/i.test(e)));
  });

  it("rejects unknown area on a scored question", () => {
    const bad = structuredClone(seed);
    bad.scoredQuestions[0]!.area = "nonexistent_area";
    const res = validateQuizDefinition(bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unknown area/i.test(e)));
  });

  it("rejects empty options on scored and profile questions", () => {
    const badScored = structuredClone(seed);
    badScored.scoredQuestions[0]!.options = [];
    const res1 = validateQuizDefinition(badScored);
    assert.equal(res1.valid, false);
    assert.ok(res1.errors.some((e) => /at least one option/i.test(e)));

    const badProfile = structuredClone(seed);
    badProfile.profileQuestions[0]!.options = [];
    const res2 = validateQuizDefinition(badProfile);
    assert.equal(res2.valid, false);
    assert.ok(res2.errors.some((e) => /at least one option/i.test(e)));
  });

  it("repairs Windows-1252 UTF-8 mojibake in normalized quiz definitions", () => {
    const corrupted = structuredClone(seed);
    corrupted.subtitle = "Steelcase + Logitech \u00e2\u20ac\u201d The Hybrid Equation";
    const res = validateQuizDefinition(corrupted);
    assert.equal(res.valid, true);
    assert.equal(res.normalized?.subtitle, "Steelcase + Logitech \u2014 The Hybrid Equation");
  });
});
