import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderAdminBuilderHtml } from "../src/render/admin-html.js";
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

    // Every http(s) URL in the generated HTML must be Turnstile, configured privacy links, or the submit endpoint
    const urls = html.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [];
    const allowedPrefixes = [
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
      "https://www.steelcase.com/privacy-policy/",
      "https://www.logitech.com/en-us/legal/privacy-policy.html",
      submitEndpoint,
    ];
    for (const u of urls) {
      assert.ok(
        allowedPrefixes.some((p) => u.startsWith(p)),
        `Unexpected external URL in standalone HTML: ${u}`,
      );
    }
  });

  it("includes v2 welcome headline/meta, area-segmented scaleX progress, section-intro cards, reactive cards, SVG score ring, CTA card, and prefers-reduced-motion", () => {
    const html = renderQuizHtml(seed, {
      turnstileSiteKey: "0x4AAAAAAA_test_key",
      submitEndpoint: "/api/quizzes/hybrid-meeting-readiness/submit",
      previewMode: false,
      standalone: false,
    });

    // 1. Welcome screen v2 headline, sub-line, meta line & area list
    assert.ok(html.includes("How Hybrid-Ready Are Your Meetings?"));
    assert.ok(html.includes("Steelcase and Logitech: Hybrid Meeting Readiness Assessment"));
    assert.ok(html.includes("~2 minutes · 9 questions · See how ready your meetings are for hybrid work with this assessment."));
    assert.ok(html.includes("Steelcase privacy policy"));
    assert.ok(html.includes("Logitech privacy policy"));
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

    // 4. Reactive answer cards + ~350ms auto-advance + A-D keyboard support + Other free-text wrap
    assert.ok(html.includes("opt-card"));
    assert.ok(html.includes("opt-badge"));
    assert.ok(html.includes("selectOptionAndAutoAdvance"));
    assert.ok(html.includes("id=\"q-other-wrap\""));
    assert.ok(html.includes("350"));

    // 5 & 6. Step transitions, SVG score ring, CTA card, Band 4 edge copy, and prefers-reduced-motion
    assert.ok(html.includes("stepSlideForward"));
    assert.ok(html.includes("score-ring-svg"));
    assert.ok(html.includes("id=\"res-ring-arc\""));
    assert.ok(html.includes("Want to talk it through?"));
    assert.ok(html.includes("Speak to us"));
    assert.ok(html.includes("Where to keep your edge"));
    assert.ok(html.includes("@media (prefers-reduced-motion: reduce)"));

    // 7. Regression checks: clean UTF-8, non-truncated .seg-label, and 0% initial ring state
    assert.ok(!html.includes("\u00e2\u20ac"));
    const segLabelBlock = html.match(/\.seg-label\s*\{[^}]+\}/)?.[0] ?? "";
    assert.ok(segLabelBlock.includes("white-space: normal"));
    assert.ok(!segLabelBlock.includes("text-overflow: ellipsis"));
    assert.ok(html.includes('<div id="res-pct" class="score-pct">0%</div>'));
    assert.ok(!html.includes(">30%<"));
  });

  it("renders dual logos side by side, single logo alone, and falls back to text lockup when no logo is uploaded", () => {
    // 0 logos -> text lockup
    const htmlNone = renderQuizHtml(seed, {
      turnstileSiteKey: "k",
      submitEndpoint: "/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(!htmlNone.includes('<div class="brand-logos"'));
    assert.ok(htmlNone.includes("Work Better by Steelcase"));

    // 1 logo -> single logo referencing stored objectKey
    const oneLogoQuiz = structuredClone(seed);
    oneLogoQuiz.theme.logo1 = {
      objectKey: "quizzes/hybrid-meeting-readiness/logos/logo1-123.png",
      contentType: "image/png",
      fileName: "steelcase.png",
      alt: "Steelcase Logo",
    };
    const htmlOne = renderQuizHtml(oneLogoQuiz, {
      turnstileSiteKey: "k",
      submitEndpoint: "/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(htmlOne.includes('<div class="brand-logos"'));
    assert.ok(
      htmlOne.includes(
        "/q/hybrid-meeting-readiness/logos/1?key=quizzes%2Fhybrid-meeting-readiness%2Flogos%2Flogo1-123.png",
      ),
    );
    assert.ok(!htmlOne.includes('<span class="brand-logo-sep"'));

    // 2 logos -> side by side with separator
    const twoLogoQuiz = structuredClone(oneLogoQuiz);
    twoLogoQuiz.theme.logo2 = {
      objectKey: "quizzes/hybrid-meeting-readiness/logos/logo2-456.svg",
      contentType: "image/svg+xml",
      fileName: "logitech.svg",
      alt: "Logitech Logo",
    };
    const htmlTwo = renderQuizHtml(twoLogoQuiz, {
      turnstileSiteKey: "k",
      submitEndpoint: "/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(
      htmlTwo.includes(
        "/q/hybrid-meeting-readiness/logos/1?key=quizzes%2Fhybrid-meeting-readiness%2Flogos%2Flogo1-123.png",
      ),
    );
    assert.ok(
      htmlTwo.includes(
        "/q/hybrid-meeting-readiness/logos/2?key=quizzes%2Fhybrid-meeting-readiness%2Flogos%2Flogo2-456.svg",
      ),
    );
    assert.ok(htmlTwo.includes('<span class="brand-logo-sep"'));

    // Welcome card no longer renders in-card logos (logos appear only once, in the top bar)
    assert.ok(!htmlTwo.includes('class="page-logos"'));
    assert.ok(!htmlTwo.includes('class="page-logo"'));
    const logo1Matches = htmlTwo.match(/\/q\/hybrid-meeting-readiness\/logos\/1\?/g) ?? [];
    assert.equal(logo1Matches.length, 1);

    // Top-bar logos render at 64px max-height (2x of 32px)
    assert.ok(htmlTwo.includes(".brand-logo { max-height: 64px;"));

    // Top-bar title text renders next to logos by default and disappears when empty
    assert.ok(
      htmlTwo.includes('<span class="header-bar-title">Hybrid Meeting Readiness Assessment</span>'),
    );
    const emptyBarTitleQuiz = structuredClone(twoLogoQuiz);
    emptyBarTitleQuiz.theme.topBarTitle = "";
    const htmlEmptyBarTitle = renderQuizHtml(emptyBarTitleQuiz, {
      turnstileSiteKey: "k",
      submitEndpoint: "/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(!htmlEmptyBarTitle.includes('class="header-bar-title"'));

    // Favicon: none by default -> no <link rel="icon"; when uploaded -> renders <link rel="icon"> in <head>
    assert.ok(!htmlTwo.includes('<link rel="icon"'));
    const withFaviconQuiz = structuredClone(twoLogoQuiz);
    withFaviconQuiz.theme.favicon = {
      objectKey: "quizzes/hybrid-meeting-readiness/logos/favicon-789.ico",
      contentType: "image/x-icon",
      fileName: "favicon.ico",
    };
    const htmlWithFavicon = renderQuizHtml(withFaviconQuiz, {
      turnstileSiteKey: "k",
      submitEndpoint: "/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(
      htmlWithFavicon.includes(
        '<link rel="icon" type="image/x-icon" href="/q/hybrid-meeting-readiness/favicon?key=quizzes%2Fhybrid-meeting-readiness%2Flogos%2Ffavicon-789.ico">',
      ),
    );
  });

  it("renders custom admin-edited respondent copy strings from quiz.copy", () => {
    const custom = structuredClone(seed);
    custom.copy = {
      ...custom.copy,
      welcomeHeadline: "Custom Welcome Headline For Testing",
      ctaHeading: "Custom Specialist Call Heading",
      ctaButton: "Book Specialist Session",
      ctaUrl: "https://www.steelcase.com/contact-us/",
    };
    const html = renderQuizHtml(custom, {
      turnstileSiteKey: "k",
      submitEndpoint: "/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(html.includes("Custom Welcome Headline For Testing"));
    assert.ok(html.includes("Custom Specialist Call Heading"));
    assert.ok(html.includes("Book Specialist Session"));
    assert.ok(html.includes("https://www.steelcase.com/contact-us/"));
  });

  it("repairs mojibake in subtitle and option strings during HTML rendering", () => {
    const corrupted = structuredClone(seed);
    corrupted.copy = { ...corrupted.copy, welcomeSubline: "Steelcase + Logitech \u00e2\u20ac\u201d The Hybrid Equation" };
    const html = renderQuizHtml(corrupted, {
      turnstileSiteKey: "0x4AAAAAAA_test_key",
      submitEndpoint: "/api/quizzes/hybrid-meeting-readiness/submit",
      previewMode: false,
      standalone: false,
    });
    assert.ok(html.includes("Steelcase + Logitech \u2014 The Hybrid Equation"));
    assert.ok(!html.includes("\u00e2\u20ac"));
  });

  it("compiles inline scripts in both renderQuizHtml and renderAdminBuilderHtml with zero syntax errors", () => {
    const quizHtml = renderQuizHtml(seed, {
      turnstileSiteKey: "0x4AAAAAAA_test_key",
      submitEndpoint: "/api/quizzes/hybrid-meeting-readiness/submit",
      previewMode: false,
      standalone: false,
    });
    const quizScripts = [...quizHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.ok(quizScripts.length > 0);
    for (const match of quizScripts) {
      assert.doesNotThrow(() => new vm.Script(match[1]!));
    }

    const adminHtml = renderAdminBuilderHtml();
    assert.ok(adminHtml.includes("Enable Co-pilot email-only paragraph"));
    assert.ok(!adminHtml.includes("Enable Gemini email-only paragraph"));
    const adminScripts = [...adminHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.ok(adminScripts.length > 0);
    for (const match of adminScripts) {
      assert.doesNotThrow(() => new vm.Script(match[1]!));
    }
  });

  it("includes Band 4 strength-framed copy variants and fresh-attempt retake reset to welcome/consent", () => {
    const html = renderQuizHtml(seed, {
      turnstileSiteKey: "0x4AAAAAAA_test_key",
      submitEndpoint: "/api/quizzes/hybrid-meeting-readiness/submit",
      previewMode: false,
      standalone: false,
    });

    // Band 4 strength-framed area copy, CTA body, and closing lines are embedded in QUIZ payload
    assert.ok(html.includes("Everyone is seen and heard"));
    assert.ok(html.includes("People can see and hear each other clearly, in the room and remotely."));
    assert.ok(html.includes("Everyone can contribute"));
    assert.ok(html.includes("Remote colleagues add to the work in real time, not after the fact."));
    assert.ok(html.includes("Your spaces keep up"));
    assert.ok(html.includes("Your rooms fit how people meet now, and someone owns keeping them that way."));
    assert.ok(
      html.includes(
        "Book a short call with a Steelcase workplace specialist about keeping your meetings working as your teams change.",
      ),
    );
    assert.ok(
      html.includes(
        "Hear how other workplaces are keeping their meetings working at The Hybrid Equation on 3 Dec, with Steelcase and Logitech.",
      ),
    );
    assert.ok(
      html.includes(
        "Watch The Hybrid Equation on demand and hear how other workplaces are keeping their meetings working, with Steelcase and Logitech.",
      ),
    );

    // Retake resets to defaultState (step: -1 = welcome/consent, consentAccepted: false, empty profile/answers)
    assert.ok(html.includes("function resetForFreshAttempt()"));
    assert.ok(html.includes("state = defaultState();"));
    assert.ok(html.includes("consentCheckbox.checked = false;"));
    assert.ok(html.includes("sessionStorage.removeItem(STORAGE_KEY);"));
  });
});
