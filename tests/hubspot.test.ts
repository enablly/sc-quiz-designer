import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHubSpotFields, buildHubSpotPayload, pushToHubSpot } from "../src/domain/hubspot.js";
import { scoreAnswers } from "../src/domain/scoring.js";
import { loadSeedDefinition } from "../src/services/seed-loader.js";

const seed = loadSeedDefinition();

describe("Acceptance Test 2: HubSpot payload builder", () => {
  it("outputs the exact 20 remapped fields (4 standard + 16 native) and 22-key JSON pack in quiz_completed", () => {
    const answers: Record<string, string> = {};
    for (const q of seed.scoredQuestions) {
      const pts = q.area === "working_together" ? 0 : 2;
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
        p1: "business_leader",
        p2: "financial_services",
        p3: "500_1999",
        p4: "southeast_asia",
      },
      result,
      geminiText: "Sample Co-pilot paragraph.",
      consentTextVersion: "consent-2026-11-v2",
      submittedAtIso: "2026-11-25T10:00:00.000Z",
      pageUri: "https://steelcase-hybrid-workplace.enablly.com/q/hybrid-meeting-readiness",
      hutk: "hutk-123",
    });

    assert.equal(fields.length, 20);
    const map = Object.fromEntries(fields.map((f) => [f.name, f.value]));

    const expectedKeys = [
      "email",
      "firstname",
      "lastname",
      "company",
      "quiz_answers",
      "additional_comments",
      "account_name",
      "project_number",
      "project_name",
      "project_city",
      "project_state",
      "project_zip_code",
      "project_manager_email",
      "client_organization",
      "temp_dealer_role_name",
      "source",
      "industry",
      "hs_role",
      "marketing_consent",
      "quiz_completed",
    ];
    assert.deepEqual(Object.keys(map), expectedKeys);

    // Forbidden fields must never be emitted
    assert.equal(map.hs_registration_method, undefined);
    assert.equal(map.engagements_last_meeting_booked_campaign, undefined);
    assert.equal(map.suppress_from_predictive_leads_campaign, undefined);

    // Pack-only fields must not be emitted at the top level
    assert.equal(map.hybrid_band_number, undefined);
    assert.equal(map.hybrid_total_points, undefined);
    assert.equal(map.hybrid_area_being_seen_and_heard_score, undefined);
    assert.equal(map.hybrid_area_working_together_score, undefined);
    assert.equal(map.hybrid_area_spaces_and_support_score, undefined);
    assert.equal(map.hybrid_priority_followup, undefined);
    assert.equal(map.hybrid_quiz_completed_at, undefined);

    // Verify top-level remapped values
    assert.equal(map.email, "ada@acme.com");
    assert.equal(map.firstname, "Ada");
    assert.equal(map.lastname, "Lovelace");
    assert.equal(map.company, "Acme Corp");
    assert.equal(map.quiz_answers, "Sample Co-pilot paragraph.");
    assert.ok(map.additional_comments?.includes("good ideas from remote colleagues get lost"));
    assert.equal(map.account_name, "Remote colleagues are on the sidelines");
    assert.equal(map.project_number, "44");
    assert.equal(map.project_name, "67");
    assert.equal(map.project_city, "0");
    assert.equal(map.project_state, "67");
    assert.equal(map.project_zip_code, "Making progress");
    assert.equal(map.project_manager_email, "Working together");
    assert.equal(map.client_organization, "Southeast Asia");
    assert.equal(map.temp_dealer_role_name, "500–1,999");
    assert.equal(map.source, "linkedin");
    assert.equal(map.industry, "financial_services");
    assert.equal(map.hs_role, "business_development");
    assert.equal(map.marketing_consent, "true");

    // Parse back quiz_completed JSON pack and assert all 22 canonical hybrid_* keys
    const pack = JSON.parse(map.quiz_completed!) as Record<string, string>;
    const expectedPackKeys = [
      "hybrid_readiness_pct",
      "hybrid_readiness_band",
      "hybrid_band_number",
      "hybrid_total_points",
      "hybrid_area_being_seen_and_heard_pct",
      "hybrid_area_being_seen_and_heard_score",
      "hybrid_area_working_together_pct",
      "hybrid_area_working_together_score",
      "hybrid_area_spaces_and_support_pct",
      "hybrid_area_spaces_and_support_score",
      "hybrid_biggest_gap",
      "hybrid_gap_headline",
      "hybrid_gap_tip",
      "hybrid_gemini_paragraph",
      "hybrid_role",
      "hybrid_industry",
      "hybrid_organization_size",
      "hybrid_region",
      "hybrid_source",
      "hybrid_consent",
      "hybrid_priority_followup",
      "hybrid_quiz_completed_at",
    ];
    assert.equal(Object.keys(pack).length, 22);
    assert.deepEqual(Object.keys(pack), expectedPackKeys);

    assert.equal(pack.hybrid_readiness_pct, "44");
    assert.equal(pack.hybrid_readiness_band, "Making progress");
    assert.equal(pack.hybrid_band_number, "2");
    assert.equal(pack.hybrid_total_points, "12");
    assert.equal(pack.hybrid_area_being_seen_and_heard_pct, "67");
    assert.equal(pack.hybrid_area_being_seen_and_heard_score, "6");
    assert.equal(pack.hybrid_area_working_together_pct, "0");
    assert.equal(pack.hybrid_area_working_together_score, "0");
    assert.equal(pack.hybrid_area_spaces_and_support_pct, "67");
    assert.equal(pack.hybrid_area_spaces_and_support_score, "6");
    assert.equal(pack.hybrid_biggest_gap, "Working together");
    assert.equal(pack.hybrid_gap_headline, "Remote colleagues are on the sidelines");
    assert.ok(pack.hybrid_gap_tip?.includes("good ideas from remote colleagues get lost"));
    assert.equal(pack.hybrid_gemini_paragraph, "Sample Co-pilot paragraph.");
    assert.equal(pack.hybrid_role, "Business leader");
    assert.equal(pack.hybrid_industry, "Financial services");
    assert.equal(pack.hybrid_organization_size, "500–1,999");
    assert.equal(pack.hybrid_region, "Southeast Asia");
    assert.equal(pack.hybrid_source, "linkedin");
    assert.equal(pack.hybrid_consent, "consent-2026-11-v2 · 2026-11-25");
    assert.equal(pack.hybrid_priority_followup, "true");
    assert.equal(pack.hybrid_quiz_completed_at, String(Date.parse("2026-11-25T10:00:00.000Z")));

    const payload = buildHubSpotPayload(seed, {
      email: "ada@acme.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Acme Corp",
      source: "linkedin",
      profile: { p1: "business_leader", p2: "financial_services", p3: "500_1999", p4: "southeast_asia" },
      result,
      geminiText: "Sample Co-pilot paragraph.",
      consentTextVersion: "consent-2026-11-v2",
      submittedAtIso: "2026-11-25T10:00:00.000Z",
      pageUri: "https://steelcase-hybrid-workplace.enablly.com/q/hybrid-meeting-readiness",
      hutk: "hutk-123",
    });
    assert.equal(payload.context.hutk, "hutk-123");
    assert.equal(payload.legalConsentOptions.consent.consentToProcess, true);
    assert.ok(payload.legalConsentOptions.consent.text.includes("consent-2026-11-v2"));
  });

  it("omits industry and hs_role when unmapped, and retries omitting dropdowns if HubSpot rejects provisional enum values", async () => {
    const answers = Object.fromEntries(
      seed.scoredQuestions.map((q) => [q.id, q.options[0]!.text]),
    );
    const result = scoreAnswers(seed, answers);

    // 1. Quiz definition where "tech" and "it" have no map entry -> omitted from fields, but preserved in quiz_completed
    const customQuiz = structuredClone(seed);
    customQuiz.integration.hubspot.industryMap = {
      financial_services: "financial_services",
    };
    customQuiz.integration.hubspot.roleMap = {};

    const fieldsOmitted = buildHubSpotFields(customQuiz, {
      email: "dev@acme.com",
      firstName: "Dev",
      lastName: "User",
      company: "Acme",
      source: "public",
      profile: { p1: "it", p2: "tech", p3: "under_100", p4: "india" },
      result,
      geminiText: "Co-pilot summary.",
      consentTextVersion: "consent-2026-11-v2",
      submittedAtIso: "2026-11-25T10:00:00.000Z",
      pageUri: "https://steelcase-hybrid-workplace.enablly.com/q/hybrid-meeting-readiness",
    });

    const omittedMap = Object.fromEntries(fieldsOmitted.map((f) => [f.name, f.value]));
    assert.equal(omittedMap.industry, undefined, "Unmapped industry must be omitted");
    assert.equal(omittedMap.hs_role, undefined, "Unmapped hs_role must be omitted");
    assert.equal(fieldsOmitted.length, 18); // 20 - 2 omitted dropdowns

    const pack = JSON.parse(omittedMap.quiz_completed!) as Record<string, string>;
    assert.equal(pack.hybrid_role, "IT");
    assert.equal(pack.hybrid_industry, "Tech");

    // 2. If HubSpot rejects a provisional enum value with 400 on first push, pushToHubSpot retries without industry/hs_role
    const sentBodies: Array<{ fields: Array<{ name: string; value: string }> }> = [];
    const mockFetch: typeof fetch = async (_input, init) => {
      const parsed = JSON.parse(String(init?.body ?? "{}")) as {
        fields: Array<{ name: string; value: string }>;
      };
      sentBodies.push(parsed);
      if (sentBodies.length === 1) {
        return new Response(
          JSON.stringify({ message: "INVALID_OPTION for hs_role" }),
          { status: 400 },
        );
      }
      return new Response("{}", { status: 200 });
    };

    const res = await pushToHubSpot(
      { HUBSPOT_PORTAL_ID: "1822507", HUBSPOT_FORM_GUID: "form-guid" },
      seed,
      {
        email: "dev@acme.com",
        firstName: "Dev",
        lastName: "User",
        company: "Acme",
        source: "public",
        profile: { p1: "it", p2: "tech", p3: "under_100", p4: "india" },
        result,
        geminiText: "Co-pilot summary.",
        consentTextVersion: "consent-2026-11-v2",
        submittedAtIso: "2026-11-25T10:00:00.000Z",
        pageUri: "https://steelcase-hybrid-workplace.enablly.com/q/hybrid-meeting-readiness",
      },
      mockFetch,
    );

    assert.equal(res.ok, true);
    assert.equal(sentBodies.length, 2);
    assert.ok(sentBodies[0]!.fields.some((f) => f.name === "industry"));
    assert.ok(sentBodies[0]!.fields.some((f) => f.name === "hs_role"));
    assert.ok(!sentBodies[1]!.fields.some((f) => f.name === "industry"));
    assert.ok(!sentBodies[1]!.fields.some((f) => f.name === "hs_role"));
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
