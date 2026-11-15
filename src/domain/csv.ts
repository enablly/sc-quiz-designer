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

  const profileColumns = quiz.profileQuestions.flatMap((pq) => {
    const hasFreeText =
      pq.options.some((o) => o.allowFreeText) ||
      sorted.some((s) => Boolean(s.profileOther?.[pq.id]));
    return hasFreeText
      ? [
          { id: pq.id, kind: "choice" as const, header: `profile_${pq.id}` },
          { id: pq.id, kind: "other" as const, header: `profile_${pq.id}_other` },
        ]
      : [{ id: pq.id, kind: "choice" as const, header: `profile_${pq.id}` }];
  });

  const headers: string[] = [
    "email",
    "first_name",
    "last_name",
    "company",
    "source",
    ...profileColumns.map((c) => c.header),
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
      ...profileColumns.map((c) =>
        c.kind === "other"
          ? (sub.profileOther?.[c.id] ?? "")
          : resolveProfileText(quiz, c.id, sub.profile[c.id] ?? ""),
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
