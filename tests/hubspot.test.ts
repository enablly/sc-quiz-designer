import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHubSpotFields, buildHubSpotPayload, pushToHubSpot } from "../src/domain/hubspot.js";
import { scoreAnswers } from "../src/domain/scoring.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";

const seed = loadSeedDefinition();

describe("Acceptance Test 2: HubSpot payload builder", () => {
  it("outputs the exact 30 fields with expected values", () => {
    const answers: Record<string, string> = {};
    for (const q of seed.scoredQuestions) {
      const pts = q.area === "equity" ? 0 : 2;
      answers[q.id] = q.options.find((o) => o.points === pts)!.text;
    }
    const result = scoreAnswers(seed, answers);

    const fields = buildHubSpotFields(seed, {
      email: "ada@acme.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Acme Corp",
      source: "linkedin",
      profile: {
        p1: "it",
        p2: "tech",
        p3: "500_1999",
        p4: "singapore",
      },
      result,
      geminiText: "Sample paragraph.",
      consentTextVersion: "consent-2026-11-v1",
      submittedAtIso: "2026-11-25T10:00:00.000Z",
      pageUri: "https://hybrid.enablly.com/q/hybrid-meeting-readiness",
      hutk: "hutk-123",
    });

    assert.equal(fields.length, 30);
    const map = Object.fromEntries(fields.map((f) => [f.name, f.value]));

    const expectedKeys = [
      "email",
      "firstname",
      "lastname",
      "company",
      "hybrid_readiness_pct",
      "hybrid_readiness_band",
      "hybrid_band_number",
      "hybrid_biggest_gap",
      "hybrid_area_spaces_pct",
      "hybrid_area_spaces_score",
      "hybrid_area_technology_pct",
      "hybrid_area_technology_score",
      "hybrid_area_equity_pct",
      "hybrid_area_equity_score",
      "hybrid_area_people_pct",
      "hybrid_area_people_score",
      "hybrid_area_support_pct",
      "hybrid_area_support_score",
      "hybrid_total_points",
      "hybrid_role",
      "hybrid_industry",
      "hybrid_office_size",
      "hybrid_market",
      "hybrid_source",
      "hybrid_priority_followup",
      "hybrid_quiz_completed_at",
      "hybrid_consent",
      "hybrid_gemini_paragraph",
      "hybrid_gap_headline",
      "hybrid_gap_tip",
    ];
    assert.deepEqual(Object.keys(map), expectedKeys);

    assert.equal(map.email, "ada@acme.com");
    assert.equal(map.firstname, "Ada");
    assert.equal(map.lastname, "Lovelace");
    assert.equal(map.company, "Acme Corp");
    assert.equal(map.hybrid_total_points, "24");
    assert.equal(map.hybrid_readiness_pct, "53");
    assert.equal(map.hybrid_band_number, "2");
    assert.equal(map.hybrid_readiness_band, "Making progress");
    assert.equal(map.hybrid_biggest_gap, "Meeting equity");
    assert.equal(map.hybrid_area_equity_pct, "0");
    assert.equal(map.hybrid_area_equity_score, "0");
    assert.equal(map.hybrid_area_spaces_pct, "67");
    assert.equal(map.hybrid_area_spaces_score, "6");
    assert.equal(map.hybrid_role, "IT");
    assert.equal(map.hybrid_industry, "Tech");
    assert.equal(map.hybrid_office_size, "500–1,999");
    assert.equal(map.hybrid_market, "Singapore");
    assert.equal(map.hybrid_source, "linkedin");
    assert.equal(map.hybrid_priority_followup, "true");
    assert.equal(map.hybrid_quiz_completed_at, String(Date.parse("2026-11-25T10:00:00.000Z")));
    assert.equal(map.hybrid_consent, "consent-2026-11-v1 · 2026-11-25");
    assert.equal(map.hybrid_gemini_paragraph, "Sample paragraph.");
    assert.equal(map.hybrid_gap_headline, "Remote colleagues are on the sidelines");
    assert.ok(map.hybrid_gap_tip?.includes("Shared whiteboards"));

    const payload = buildHubSpotPayload(seed, {
      email: "ada@acme.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Acme Corp",
      source: "linkedin",
      profile: { p1: "it", p2: "tech", p3: "500_1999", p4: "singapore" },
      result,
      geminiText: "Sample paragraph.",
      consentTextVersion: "consent-2026-11-v1",
      submittedAtIso: "2026-11-25T10:00:00.000Z",
      pageUri: "https://hybrid.enablly.com/q/hybrid-meeting-readiness",
      hutk: "hutk-123",
    });
    assert.equal(payload.context.hutk, "hutk-123");
    assert.equal(payload.legalConsentOptions.consent.consentToProcess, true);
    assert.ok(payload.legalConsentOptions.consent.text.includes("consent-2026-11-v1"));
  });

  it("uses api-eu1 host when HUBSPOT_REGION=eu", async () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [q.id, q.options[0]!.text]),
    );
    const result = scoreAnswers(seed, answers);
    let capturedUrl = "";
    const mockFetch: typeof fetch = async (input) => {
      capturedUrl = String(input);
      return new Response("{}", { status: 200 });
    };

    const res = await pushToHubSpot(
      { HUBSPOT_PORTAL_ID: "123", HUBSPOT_FORM_GUID: "abc", HUBSPOT_REGION: "eu" },
      seed,
      {
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        company: "Co",
        source: "public",
        profile: { p1: "IT", p2: "Tech", p3: "Under 100", p4: "Singapore" },
        result,
        geminiText: "Text",
        consentTextVersion: "consent-2026-11-v1",
        submittedAtIso: "2026-11-25T10:00:00.000Z",
        pageUri: "https://hybrid.enablly.com/q/hybrid-meeting-readiness",
      },
      mockFetch,
    );
    assert.equal(res.ok, true);
    assert.equal(
      capturedUrl,
      "https://api-eu1.hsforms.com/submissions/v3/integration/submit/123/abc",
    );
  });
});
