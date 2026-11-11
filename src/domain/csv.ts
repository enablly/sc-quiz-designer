import type { QuizDefinition, SubmissionDocument } from "../types.js";
import { resolveProfileText } from "./scoring.js";

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sortSubmissionsForExport(
  submissions: SubmissionDocument[],
): SubmissionDocument[] {
  return [...submissions].sort((a, b) => {
    if (a.priorityFollowup !== b.priorityFollowup) {
      return a.priorityFollowup ? -1 : 1;
    }
    if (a.result.band.band !== b.result.band.band) {
      return a.result.band.band - b.result.band.band;
    }
    if (a.result.readinessPct !== b.result.readinessPct) {
      return a.result.readinessPct - b.result.readinessPct;
    }
    return a.first_submitted_at.localeCompare(b.first_submitted_at);
  });
}

export function buildSubmissionsCsv(
  quiz: QuizDefinition,
  submissions: SubmissionDocument[],
): string {
  const areaNameByKey = new Map(quiz.areas.map((a) => [a.key, a.name]));
  const sorted = sortSubmissionsForExport(submissions);

  const headers: string[] = [
    "email",
    "first_name",
    "last_name",
    "company",
    "source",
    ...quiz.profileQuestions.map((pq) => `profile_${pq.id}`),
    ...quiz.scoredQuestions.map((sq) => `${sq.id}_points`),
    ...quiz.areas.flatMap((a) => [`area_${a.key}_score`, `area_${a.key}_pct`]),
    "total_points",
    "readiness_pct",
    "band_number",
    "band_label",
    "biggest_gap",
    "priority_followup",
    "attempt_count",
    "first_submitted_at",
    "hubspot_status",
    "gemini_status",
  ];

  const rows: string[][] = [headers];

  for (const sub of sorted) {
    const gapNames = sub.result.biggestGap
      .map((k) => areaNameByKey.get(k) ?? k)
      .join(" + ");

    const row: unknown[] = [
      sub.email,
      sub.firstName,
      sub.lastName,
      sub.company,
      sub.source,
      ...quiz.profileQuestions.map((pq) =>
        resolveProfileText(quiz, pq.id, sub.profile[pq.id] ?? ""),
      ),
      ...quiz.scoredQuestions.map((sq) => sub.result.pointsByQuestion[sq.id] ?? ""),
      ...quiz.areas.flatMap((a) => [
        sub.result.areaScores[a.key] ?? 0,
        sub.result.areaPcts[a.key] ?? 0,
      ]),
      sub.result.totalPoints,
      sub.result.readinessPct,
      sub.result.band.band,
      sub.result.band.label,
      gapNames,
      sub.priorityFollowup ? "true" : "false",
      sub.attempt_count,
      sub.first_submitted_at,
      sub.hubspot_status,
      sub.gemini_status,
    ];
    rows.push(row.map(escapeCsvCell));
  }

  return rows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}
