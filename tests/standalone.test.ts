import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderQuizHtml } from "../src/render/quiz-html.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";

const seed = loadSeedDefinition();

describe("Acceptance Test 5: Standalone HTML export", () => {
  it("contains quiz content and only Turnstile + submit endpoint as external URLs", () => {
    const submitEndpoint = "https://hybrid.enablly.com/api/quizzes/hybrid-meeting-readiness/submit";
    const html = renderQuizHtml(seed, {
      turnstileSiteKey: "0x4AAAAAAA_test_key",
      submitEndpoint,
      previewMode: false,
      standalone: true,
    });

    // Quiz content present
    assert.ok(html.includes("Hybrid Meeting Readiness Assessment"));
    assert.ok(html.includes(seed.consent.textVersion));
    assert.ok(html.includes(seed.scoredQuestions[0]!.text));
    assert.ok(html.includes("0x4AAAAAAA_test_key"));
    assert.ok(html.includes(submitEndpoint));

    // Inline CSS & JS (no external stylesheet)
    assert.ok(html.includes("<style>"));
    assert.ok(!/<link\b/i.test(html));

    // Every http(s) URL in the generated HTML must be Turnstile or the submit endpoint
    const urls = html.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [];
    const allowedPrefixes = [
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
      submitEndpoint,
    ];
    for (const u of urls) {
      assert.ok(
        allowedPrefixes.some((p) => u.startsWith(p)),
        `Unexpected external URL in standalone HTML: ${u}`,
      );
    }
  });
});
