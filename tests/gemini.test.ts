import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGeminiPayload,
  generateParagraph,
  validateParagraph,
} from "../src/domain/gemini.js";
import { renderFallbackParagraph, scoreAnswers } from "../src/domain/scoring.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";
import type { QuizDefinition } from "../src/types.js";

const seed = loadSeedDefinition();

function makeScore() {
  const answers: Record<string, string> = {};
  for (const q of seed.scoredQuestions) {
    const pts = q.area === "spaces" ? 0 : 2;
    answers[q.id] = q.options.find((o) => o.points === pts)!.text;
  }
  return scoreAnswers(seed, answers);
}

describe("Acceptance Test 3: Gemini payload, validator, and fallback", () => {
  it("contains no identity fields in payload", () => {
    const res = makeScore();
    const payload = buildGeminiPayload(seed, res);
    const json = JSON.stringify(payload);
    assert.ok(!("email" in payload));
    assert.ok(!("firstName" in payload));
    assert.ok(!("lastName" in payload));
    assert.ok(!("company" in payload));
    assert.ok(!json.includes("email"));
    assert.equal(payload.readiness_pct, res.readinessPct);
    assert.equal(payload.lowest_questions.length, 3);
    assert.equal(payload.areas.length, 5);
  });

  it("rejects wrong word count, multiline, URLs, and foreign numbers", () => {
    const res = makeScore();
    // Too short
    assert.equal(validateParagraph("Short paragraph only.", res), false);

    // Too long (>110 words)
    const longText = Array.from({ length: 120 }, () => "word").join(" ");
    assert.equal(validateParagraph(longText, res), false);

    // Valid length (~75 words) using allowed percentages only
    const baseWords = Array.from({ length: 70 }, () => "readiness").join(" ");
    const valid = `Your readiness is ${res.readinessPct}% across your hybrid spaces. ${baseWords}`;
    assert.equal(validateParagraph(valid, res), true);

    // Multi-paragraph rejected
    assert.equal(validateParagraph(`${valid}\nSecond line`, res), false);

    // URL rejected
    assert.equal(validateParagraph(`${valid} https://example.com`, res), false);
    assert.equal(validateParagraph(`${valid} www.example.com`, res), false);

    // Foreign number rejected
    assert.equal(validateParagraph(`${valid} and 99 other metrics`, res), false);

    // Year / currency rejected
    assert.equal(validateParagraph(`${valid} in 2026`, res), false);
    assert.equal(validateParagraph(`${valid} for $500`, res), false);
  });

  it("falls back with slots filled on API failure or invalid output", async () => {
    const res = makeScore();

    // Missing API key -> fallback
    const fb1 = await generateParagraph({}, seed, res);
    assert.equal(fb1.status, "fallback");
    assert.ok(fb1.text.includes(`${res.readinessPct}%`));
    assert.ok(fb1.text.includes(res.band.label));
    assert.ok(fb1.text.includes("Spaces"));

    // Invalid Gemini output -> fallback
    const badFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Visit https://spam.com for 999 deals!" }] } }],
        }),
        { status: 200 },
      );
    const fb2 = await generateParagraph(
      { GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-2.5-flash-lite" },
      seed,
      res,
      badFetch,
    );
    assert.equal(fb2.status, "fallback");
    assert.equal(fb2.text, fb1.text);

    // Valid Gemini output -> ok
    const validText =
      `Your overall readiness score sits at ${res.readinessPct}% today, showing solid momentum across several areas while pointing clearly toward spaces as your primary focus. ` +
      `When rooms are shaped around the camera and display, remote colleagues feel present in the conversation rather than observing from the edges. ` +
      `Building on your stronger areas at ${res.areaPcts.technology}% will help your teams turn small room layout improvements into consistent, inclusive hybrid meetings every day.`;
    const goodFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: validText }] } }],
        }),
        { status: 200 },
      );
    const okRes = await generateParagraph(
      { GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-2.5-flash-lite" },
      seed,
      res,
      goodFetch,
    );
    assert.equal(okRes.status, "ok");
    assert.equal(okRes.text, validText);
  });

  it("supports brief's custom fallback slot names", () => {
    const res = makeScore();
    const custom: QuizDefinition = {
      ...structuredClone(seed),
      scoring: {
        ...structuredClone(seed.scoring),
        fallbackParagraphs: {
          [String(res.band.band)]:
            "Score={score}% Band={bandLabel} Best={bestArea}({bestPct}%) Gap={gapArea}({gapPct}%) Tip={tip}",
        },
      },
    };
    const text = renderFallbackParagraph(custom, res);
    assert.ok(text.includes(`Score=${res.readinessPct}%`));
    assert.ok(text.includes(`Band=${res.band.label}`));
    assert.ok(text.includes("Gap=Spaces(0%)"));
    assert.ok(text.includes("Best="));
  });
});
