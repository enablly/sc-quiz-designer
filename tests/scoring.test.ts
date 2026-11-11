import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  priorityFlag,
  renderFallbackParagraph,
  scoreAnswers,
  pointsForAnswer,
} from "../src/domain/scoring.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";
import type { QuizDefinition } from "../src/types.js";

const seed = loadSeedDefinition();

function buildAnswersWithTargetTotal(targetTotal: number): Record<string, string> {
  const answers: Record<string, string> = {};
  let remaining = targetTotal;
  for (const q of seed.scoredQuestions) {
    const pts = Math.min(3, remaining);
    remaining -= pts;
    const opt = q.options.find((o) => o.points === pts);
    assert.ok(opt, `missing ${pts}-pt option on ${q.id}`);
    answers[q.id] = opt.text;
  }
  assert.equal(remaining, 0);
  return answers;
}

describe("Acceptance Test 1: Scoring vectors on seed", () => {
  it("scores all-best as 100% Band 4", () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [
        q.id,
        q.options.find((o) => o.points === 3)!.text,
      ]),
    );
    const res = scoreAnswers(seed, answers);
    assert.equal(res.totalPoints, 45);
    assert.equal(res.maxPoints, 45);
    assert.equal(res.readinessPct, 100);
    assert.equal(res.band.band, 4);
    assert.equal(res.band.label, "Hybrid ready");
  });

  it("scores all-worst as 0% Band 1", () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [
        q.id,
        q.options.find((o) => o.points === 0)!.text,
      ]),
    );
    const res = scoreAnswers(seed, answers);
    assert.equal(res.totalPoints, 0);
    assert.equal(res.readinessPct, 0);
    assert.equal(res.band.band, 1);
    assert.equal(res.band.label, "Getting started");
  });

  it("scores all-2-points as 67% Band 3", () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [
        q.id,
        q.options.find((o) => o.points === 2)!.text,
      ]),
    );
    const res = scoreAnswers(seed, answers);
    assert.equal(res.totalPoints, 30);
    assert.equal(res.readinessPct, 67);
    assert.equal(res.band.band, 3);
    assert.equal(res.band.label, "Nearly there");
  });

  it("places boundary raw totals (17/18, 29/30, 38/39) in the right bands", () => {
    const cases: Array<[number, number, number]> = [
      [17, 38, 1],
      [18, 40, 2],
      [29, 64, 2],
      [30, 67, 3],
      [38, 84, 3],
      [39, 87, 4],
    ];
    for (const [raw, expectedPct, expectedBand] of cases) {
      const res = scoreAnswers(seed, buildAnswersWithTargetTotal(raw));
      assert.equal(res.totalPoints, raw);
      assert.equal(res.readinessPct, expectedPct, `raw=${raw}`);
      assert.equal(res.band.band, expectedBand, `raw=${raw}`);
    }
  });

  it("returns all tied lowest areas as biggestGap", () => {
    const answers: Record<string, string> = {};
    for (const q of seed.scoredQuestions) {
      // spaces and technology get 0 pts (0%), all other areas get 3 pts (100%)
      const pts = q.area === "spaces" || q.area === "technology" ? 0 : 3;
      answers[q.id] = q.options.find((o) => o.points === pts)!.text;
    }
    const res = scoreAnswers(seed, answers);
    assert.deepEqual(res.biggestGap, ["spaces", "technology"]);
    assert.equal(
      res.gapHeadline,
      "Your rooms weren't built for the screen + People can't always see or hear each other",
    );
    assert.ok(res.gapTip.includes("camera and display"));
    assert.ok(res.gapTip.includes("Clear audio"));
  });

  it("rejects unknown answer texts and missing questions", () => {
    assert.throws(
      () => pointsForAnswer(seed, "q1", "Completely fabricated answer"),
      /unknown answer/,
    );
    const answers = buildAnswersWithTargetTotal(30);
    answers.q5 = "Not a real option";
    assert.throws(() => scoreAnswers(seed, answers), /unknown answer/);
  });

  it("evaluates priority-rule truth table across band x role x office size", () => {
    const cases: Array<[number, string, string, boolean]> = [
      // Band 1 & 2 with priority role + priority size -> true
      [1, "IT", "500–1,999", true],
      [2, "Workplace / Real estate / Facilities", "2,000+", true],
      [2, "Business leader", "500_1999", true],
      [1, "it", "2000_plus", true],
      // Non-priority role -> false
      [1, "HR / People", "2,000+", false],
      [2, "other", "500–1,999", false],
      // Non-priority office size -> false
      [1, "IT", "Under 100", false],
      [2, "Business leader", "100–499", false],
      // Band 3 & 4 -> always false
      [3, "IT", "2,000+", false],
      [4, "Workplace / Real estate / Facilities", "2,000+", false],
    ];

    for (const [band, role, size, expected] of cases) {
      const actual = priorityFlag(seed, band, {
        p1: role,
        p2: "Tech",
        p3: size,
        p4: "Singapore",
      });
      assert.equal(
        actual,
        expected,
        `band=${band}, role=${role}, size=${size}`,
      );
    }
  });

  it("computes max points dynamically from definition (not hardcoded 45)", () => {
    const custom: QuizDefinition = {
      ...structuredClone(seed),
      areas: [{ key: "alpha", name: "Alpha" }],
      scoredQuestions: [
        {
          id: "c1",
          area: "alpha",
          text: "Q1",
          options: [{ points: 10, text: "Ten" }, { points: 0, text: "Zero" }],
        },
        {
          id: "c2",
          area: "alpha",
          text: "Q2",
          options: [{ points: 5, text: "Five" }, { points: 0, text: "Zero" }],
        },
      ],
    };
    const res = scoreAnswers(custom, { c1: "Ten", c2: "Zero" });
    assert.equal(res.totalPoints, 10);
    assert.equal(res.maxPoints, 15);
    assert.equal(res.readinessPct, 67);
    assert.ok(renderFallbackParagraph(custom, res).includes("67%"));
  });
});
