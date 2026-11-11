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

const HYBRID_AREA_KEYS = ["spaces", "technology", "equity", "people", "support"] as const;

export function buildHubSpotFields(
  quiz: QuizDefinition,
  r: HubSpotSubmissionRecord,
): { name: string; value: string }[] {
  const res = r.result;
  const areaNameByKey = new Map(quiz.areas.map((a) => [a.key, a.name]));
  const gapCopy = quiz.scoring.gapCopy ?? {};

  const p1Id = quiz.profileQuestions[0]?.id ?? "p1";
  const p2Id = quiz.profileQuestions[1]?.id ?? "p2";
  const p3Id = quiz.profileQuestions[2]?.id ?? "p3";
  const p4Id = quiz.profileQuestions[3]?.id ?? "p4";

  const f: Record<string, string> = {
    email: r.email,
    firstname: r.firstName,
    lastname: r.lastName,
    company: r.company,
    hybrid_readiness_pct: String(res.readinessPct),
    hybrid_readiness_band: res.band.label,
    hybrid_band_number: String(res.band.band),
    hybrid_biggest_gap: res.biggestGap
      .map((k) => areaNameByKey.get(k) ?? k)
      .join(" + "),
  };

  for (const key of HYBRID_AREA_KEYS) {
    f[`hybrid_area_${key}_pct`] = String(res.areaPcts[key] ?? 0);
    f[`hybrid_area_${key}_score`] = String(res.areaScores[key] ?? 0);
  }

  f.hybrid_total_points = String(res.totalPoints);
  f.hybrid_role = resolveProfileText(quiz, p1Id, r.profile[p1Id] ?? "");
  f.hybrid_industry = resolveProfileText(quiz, p2Id, r.profile[p2Id] ?? "");
  f.hybrid_office_size = resolveProfileText(quiz, p3Id, r.profile[p3Id] ?? "");
  f.hybrid_market = resolveProfileText(quiz, p4Id, r.profile[p4Id] ?? "");
  f.hybrid_source = r.source;
  f.hybrid_priority_followup = priorityFlag(quiz, res.band.band, r.profile) ? "true" : "false";
  f.hybrid_quiz_completed_at = String(Date.parse(r.submittedAtIso));
  f.hybrid_consent = `${r.consentTextVersion} · ${r.submittedAtIso.slice(0, 10)}`;
  f.hybrid_gemini_paragraph = r.geminiText;
  f.hybrid_gap_headline = res.biggestGap
    .map((k) => gapCopy[k]?.headline ?? k)
    .join(" + ");
  f.hybrid_gap_tip = res.biggestGap
    .map((k) => gapCopy[k]?.tip ?? "")
    .filter(Boolean)
    .join(" ");

  return Object.entries(f).map(([name, value]) => ({ name, value }));
}

export function buildHubSpotPayload(
  quiz: QuizDefinition,
  r: HubSpotSubmissionRecord,
) {
  return {
    submittedAt: String(Date.parse(r.submittedAtIso)),
    fields: buildHubSpotFields(quiz, r),
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
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text();
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e).slice(0, 500) };
  }
}
