import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderQuizHtml } from "../src/render/quiz-html.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";

const seed = loadSeedDefinition();

describe("Acceptance Test 5: Standalone HTML export & Design upgrade", () => {
  it("contains quiz content and only Turnstile + submit endpoint as external URLs", () => {
    const submitEndpoint = "https://steelcase-hybrid-workplace.enablly.com/api/quizzes/hybrid-meeting-readiness/submit";
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

  it("includes welcome roadmap, area-segmented scaleX progress, section-intro cards, reactive cards, SVG score ring, and prefers-reduced-motion", () => {
    const html = renderQuizHtml(seed, {
      turnstileSiteKey: "0x4AAAAAAA_test_key",
      submitEndpoint: "/api/quizzes/hybrid-meeting-readiness/submit",
      previewMode: false,
      standalone: false,
    });

    // 1. Welcome screen roadmap & area list
    assert.ok(html.includes("~3 minutes · 5 areas · 19 questions · get your readiness score and biggest gap at the end"));
    for (const a of seed.areas) {
      assert.ok(html.includes(a.name));
      assert.ok(a.blurb && html.includes(a.blurb));
    }

    // 2. Area-segmented progress animated via transform: scaleX
    assert.ok(html.includes("id=\"seg-grid\""));
    assert.ok(html.includes("scaleX(var(--seg-scale, 0))"));
    assert.ok(html.includes("in this area"));
    assert.ok(html.includes("overall"));

    // 3. Section-intro view
    assert.ok(html.includes("id=\"section-intro-view\""));
    assert.ok(html.includes("id=\"intro-continue-btn\""));

    // 4. Reactive answer cards + ~350ms auto-advance + A-D keyboard support
    assert.ok(html.includes("opt-card"));
    assert.ok(html.includes("opt-badge"));
    assert.ok(html.includes("selectOptionAndAutoAdvance"));
    assert.ok(html.includes("350"));

    // 5 & 6. Step transitions, SVG score ring, and prefers-reduced-motion
    assert.ok(html.includes("stepSlideForward"));
    assert.ok(html.includes("score-ring-svg"));
    assert.ok(html.includes("id=\"res-ring-arc\""));
    assert.ok(html.includes("@media (prefers-reduced-motion: reduce)"));

    // 7. Regression checks: clean UTF-8 em-dash, non-truncated .seg-label, and 0% initial ring state
    assert.ok(html.includes('<p class="co-brand">Steelcase + Logitech \u2014 The Hybrid Equation</p>'));
    assert.ok(!html.includes("\u00e2\u20ac"));
    const segLabelBlock = html.match(/\.seg-label\s*\{[^}]+\}/)?.[0] ?? "";
    assert.ok(segLabelBlock.includes("white-space: normal"));
    assert.ok(!segLabelBlock.includes("text-overflow: ellipsis"));
    assert.ok(html.includes('<div id="res-pct" class="score-pct">0%</div>'));
    assert.ok(!html.includes(">30%<"));
  });

  it("repairs mojibake in subtitle and option strings during HTML rendering", () => {
    const corrupted = structuredClone(seed);
    corrupted.subtitle = "Steelcase + Logitech \u00e2\u20ac\u201d The Hybrid Equation";
    const html = renderQuizHtml(corrupted, {
      turnstileSiteKey: "0x4AAAAAAA_test_key",
      submitEndpoint: "/api/quizzes/hybrid-meeting-readiness/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(html.includes("Steelcase + Logitech \u2014 The Hybrid Equation"));
    assert.ok(!html.includes("\u00e2\u20ac"));
  });
});
