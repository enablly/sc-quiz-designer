import type { QuizDefinition, ScoreResult } from "../types.js";
import { priorityFlag, resolveProfileText } from "./scoring.js";

export interface HubSpotSubmissionRecord {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  source: string;
  profile: Record<string, string>;
  result: ScoreResult;
  geminiText: string;
  consentTextVersion: string;
  submittedAtIso: string;
  pageUri: string;
  hutk?: string;
}

export interface HubSpotEnv {
  HUBSPOT_PORTAL_ID?: string;
  HUBSPOT_FORM_GUID?: string;
  HUBSPOT_REGION?: string;
}

export interface BuildHubSpotFieldsOptions {
  omitIndustry?: boolean;
  omitRole?: boolean;
}

/**
 * Default dropdown value-map for HubSpot `industry` property (portal 1822507).
 * - financial_services -> financial_services (CONFIRMED)
 * - manufacturing -> appliance_manufacturing (PROVISIONAL)
 * - tech, professional_services, public_sector_education, other -> PROVISIONAL best-effort snake_case
 */
export const DEFAULT_HUBSPOT_INDUSTRY_MAP: Record<string, string> = {
  financial_services: "financial_services", // confirmed
  manufacturing: "appliance_manufacturing", // provisional
  tech: "computer_software", // provisional best-effort
  professional_services: "management_consulting", // provisional best-effort
  public_sector_education: "higher_education", // provisional best-effort
  other: "other", // provisional best-effort
};

/**
 * Default dropdown value-map for HubSpot `hs_role` property (portal 1822507).
 * None of the quiz roles is confirmed yet; all entries are PROVISIONAL best-effort snake_case.
 */
export const DEFAULT_HUBSPOT_ROLE_MAP: Record<string, string> = {
  workplace_facilities: "operations", // provisional
  it: "information_technology", // provisional
  hr_people: "human_resources", // provisional
  business_leader: "business_development", // provisional
  other: "other", // provisional
};

/**
 * Resolve a profile answer (option code or display text) against the configured dropdown value-map.
 * FAIL-SAFE: if the respondent's value has no map entry (or maps to empty string), returns undefined
 * so the caller omits the field rather than sending an unmatched enum value.
 */
export function resolveMappedDropdownValue(
  quiz: QuizDefinition,
  questionId: string,
  rawVal: string,
  valueMap: Record<string, string>,
): string | undefined {
  const trimmed = (rawVal ?? "").trim();
  if (!trimmed) return undefined;

  const pq = quiz.profileQuestions.find((x) => x.id === questionId);
  const opt = pq?.options.find(
    (o) =>
      o.code === trimmed ||
      o.text === trimmed ||
      o.code.toLowerCase() === trimmed.toLowerCase() ||
      o.text.toLowerCase() === trimmed.toLowerCase(),
  );

  const candidates = [
    ...(opt ? [opt.code, opt.code.toLowerCase(), opt.text, opt.text.toLowerCase()] : []),
    trimmed,
    trimmed.toLowerCase(),
  ];

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(valueMap, key)) {
      const mapped = String(valueMap[key] ?? "").trim();
      return mapped.length > 0 ? mapped : undefined;
    }
  }
  return undefined;
}

/**
 * Build the 22-key canonical `hybrid_*` JSON pack object written into `quiz_completed`.
 */
export function buildHubSpotJsonPack(
  quiz: QuizDefinition,
  r: HubSpotSubmissionRecord,
): Record<string, string> {
  const res = r.result;
  const areaNameByKey = new Map(quiz.areas.map((a) => [a.key, a.name]));
  const gapCopy = quiz.scoring.gapCopy ?? {};
  const isBand4 = res.band.band === 4;

  const p1Id = quiz.profileQuestions[0]?.id ?? "p1";
  const p2Id = quiz.profileQuestions[1]?.id ?? "p2";
  const p3Id = quiz.profileQuestions[2]?.id ?? "p3";
  const p4Id = quiz.profileQuestions[3]?.id ?? "p4";

  const gapHeadline =
    res.gapHeadline ||
    res.biggestGap
      .map((k) =>
        isBand4 && gapCopy[k]?.band4Headline
          ? gapCopy[k]!.band4Headline!
          : (gapCopy[k]?.headline ?? k),
      )
      .join(" + ");

  const gapTip =
    res.gapTip ||
    res.biggestGap
      .map((k) =>
        isBand4 && gapCopy[k]?.band4Tip
          ? gapCopy[k]!.band4Tip!
          : (gapCopy[k]?.tip ?? ""),
      )
      .filter(Boolean)
      .join(" ");

  const pack: Record<string, string> = {
    hybrid_readiness_pct: String(res.readinessPct),
    hybrid_readiness_band: res.band.label,
    hybrid_band_number: String(res.band.band),
    hybrid_total_points: String(res.totalPoints),
  };

  for (const area of quiz.areas) {
    pack[`hybrid_area_${area.key}_pct`] = String(res.areaPcts[area.key] ?? 0);
    pack[`hybrid_area_${area.key}_score`] = String(res.areaScores[area.key] ?? 0);
  }

  pack.hybrid_biggest_gap = res.biggestGap
    .map((k) => areaNameByKey.get(k) ?? k)
    .join(" + ");
  pack.hybrid_gap_headline = gapHeadline;
  pack.hybrid_gap_tip = gapTip;
  pack.hybrid_gemini_paragraph = r.geminiText;
  pack.hybrid_role = resolveProfileText(quiz, p1Id, r.profile[p1Id] ?? "");
  pack.hybrid_industry = resolveProfileText(quiz, p2Id, r.profile[p2Id] ?? "");
  pack.hybrid_organization_size = resolveProfileText(quiz, p3Id, r.profile[p3Id] ?? "");
  pack.hybrid_region = resolveProfileText(quiz, p4Id, r.profile[p4Id] ?? "");
  pack.hybrid_source = r.source;
  pack.hybrid_consent = `${r.consentTextVersion} · ${r.submittedAtIso.slice(0, 10)}`;
  pack.hybrid_priority_followup = priorityFlag(quiz, res.band.band, r.profile)
    ? "true"
    : "false";
  pack.hybrid_quiz_completed_at = String(Date.parse(r.submittedAtIso));

  return pack;
}

export function buildHubSpotFields(
  quiz: QuizDefinition,
  r: HubSpotSubmissionRecord,
  opts?: BuildHubSpotFieldsOptions,
): { name: string; value: string }[] {
  const res = r.result;
  const p1Id = quiz.profileQuestions[0]?.id ?? "p1";
  const p2Id = quiz.profileQuestions[1]?.id ?? "p2";

  const pack = buildHubSpotJsonPack(quiz, r);

  const area0Key = quiz.areas[0]?.key ?? "being_seen_and_heard";
  const area1Key = quiz.areas[1]?.key ?? "working_together";
  const area2Key = quiz.areas[2]?.key ?? "spaces_and_support";

  const industryMap =
    quiz.integration?.hubspot?.industryMap ?? DEFAULT_HUBSPOT_INDUSTRY_MAP;
  const roleMap =
    quiz.integration?.hubspot?.roleMap ?? DEFAULT_HUBSPOT_ROLE_MAP;

  const mappedIndustry = opts?.omitIndustry
    ? undefined
    : resolveMappedDropdownValue(quiz, p2Id, r.profile[p2Id] ?? "", industryMap);
  const mappedRole = opts?.omitRole
    ? undefined
    : resolveMappedDropdownValue(quiz, p1Id, r.profile[p1Id] ?? "", roleMap);

  const fields: { name: string; value: string }[] = [
    // 4 standard fields
    { name: "email", value: r.email },
    { name: "firstname", value: r.firstName },
    { name: "lastname", value: r.lastName },
    { name: "company", value: r.company },

    // Remapped existing native fields (up to 16)
    { name: "quiz_answers", value: pack.hybrid_gemini_paragraph ?? "" },
    { name: "additional_comments", value: pack.hybrid_gap_tip ?? "" },
    { name: "account_name", value: pack.hybrid_gap_headline ?? "" },
    { name: "project_number", value: String(res.readinessPct) },
    {
      name: "project_name",
      value: String(
        res.areaPcts.being_seen_and_heard ?? res.areaPcts[area0Key] ?? 0,
      ),
    },
    {
      name: "project_city",
      value: String(
        res.areaPcts.working_together ?? res.areaPcts[area1Key] ?? 0,
      ),
    },
    {
      name: "project_state",
      value: String(
        res.areaPcts.spaces_and_support ?? res.areaPcts[area2Key] ?? 0,
      ),
    },
    { name: "project_zip_code", value: res.band.label },
    { name: "project_manager_email", value: pack.hybrid_biggest_gap ?? "" },
    { name: "client_organization", value: pack.hybrid_region ?? "" },
    { name: "temp_dealer_role_name", value: pack.hybrid_organization_size ?? "" },
    { name: "source", value: r.source },
  ];

  // FAIL-SAFE: Only include dropdown fields when a valid mapped value exists
  if (mappedIndustry !== undefined) {
    fields.push({ name: "industry", value: mappedIndustry });
  }
  if (mappedRole !== undefined) {
    fields.push({ name: "hs_role", value: mappedRole });
  }

  fields.push(
    {
      name: "marketing_consent",
      value: r.consentTextVersion ? "true" : "false",
    },
    {
      name: "quiz_completed",
      value: JSON.stringify(pack),
    },
  );

  return fields;
}

export function buildHubSpotPayload(
  quiz: QuizDefinition,
  r: HubSpotSubmissionRecord,
  opts?: BuildHubSpotFieldsOptions,
) {
  return {
    submittedAt: String(Date.parse(r.submittedAtIso)),
    fields: buildHubSpotFields(quiz, r, opts),
    context: {
      pageUri: r.pageUri,
      pageName: quiz.title,
      ...(r.hutk ? { hutk: r.hutk } : {}),
    },
    legalConsentOptions: {
      consent: {
        consentToProcess: true,
        text: `I agree to my answers being shared with Steelcase and Logitech for my results and related follow-up. (${r.consentTextVersion})`,
      },
    },
  };
}

export async function pushToHubSpot(
  env: HubSpotEnv,
  quiz: QuizDefinition,
  r: HubSpotSubmissionRecord,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!env.HUBSPOT_PORTAL_ID || !env.HUBSPOT_FORM_GUID) {
    return { ok: false, status: 0, error: "hubspot not configured" };
  }
  const host = env.HUBSPOT_REGION === "eu" ? "api-eu1.hsforms.com" : "api.hsforms.com";
  const url = `https://${host}/submissions/v3/integration/submit/${env.HUBSPOT_PORTAL_ID}/${env.HUBSPOT_FORM_GUID}`;
  const body = buildHubSpotPayload(quiz, r);
  const hasDropdownFields = body.fields.some(
    (f) => f.name === "industry" || f.name === "hs_role",
  );
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, status: res.status };

    const firstErrText = await res.text();
    // FAIL-SAFE: if HubSpot rejects the submission (e.g. 400 INVALID_OPTION on a provisional dropdown enum),
    // retry once omitting industry and hs_role so the rest of the submission + quiz_completed JSON pack still lands.
    if (res.status === 400 && hasDropdownFields) {
      const fallbackBody = buildHubSpotPayload(quiz, r, {
        omitIndustry: true,
        omitRole: true,
      });
      const retryRes = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
      });
      if (retryRes.ok) return { ok: true, status: retryRes.status };
      const retryErrText = await retryRes.text();
      return {
        ok: false,
        status: retryRes.status,
        error: retryErrText.slice(0, 500),
      };
    }

    return { ok: false, status: res.status, error: firstErrText.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e).slice(0, 500) };
  }
}
