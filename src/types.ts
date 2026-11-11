export type QuizStatus = "draft" | "published";
export type LivePhase = "pre" | "post";
export type HubSpotSyncStatus = "pending" | "synced" | "failed";
export type GeminiStatus = "ok" | "fallback";

export interface QuizTheme {
  accent: string;
  headerText: string;
  logoUrl?: string;
}

export interface QuizConsent {
  textVersion: string;
  text: string;
}

export interface ProfileOption {
  code: string;
  text: string;
}

export interface ProfileQuestion {
  id: string;
  label?: string;
  options: ProfileOption[];
}

export interface AreaDefinition {
  key: string;
  name: string;
}

export interface ScoredOption {
  points: number;
  text: string;
}

export interface ScoredQuestion {
  id: string;
  area: string;
  text: string;
  /** Either option indices (0-based into options) or exact option texts */
  displayOrder?: (number | string)[];
  options: ScoredOption[];
}

export interface ScoringBand {
  band: number;
  min: number;
  max: number;
  minPct?: number;
  maxPct?: number;
  label: string;
  headline: string;
  body: string;
}

export interface GapCopyEntry {
  headline: string;
  tip: string;
}

export interface PriorityRule {
  bandsAtOrBelow: number;
  roleIds?: string[];
  roleValues: string[];
  sizeIds?: string[];
  sizeValues: string[];
}

export interface QuizScoring {
  scoringVersion: string;
  bands: ScoringBand[];
  gapCopy: Record<string, GapCopyEntry>;
  fallbackParagraphs: Record<string, string>;
  priorityRule: PriorityRule;
}

export interface QuizClosing {
  livePhase?: LivePhase;
  preEvent: string;
  postEvent: string;
}

export interface QuizIntegration {
  hubspot: {
    mappingStyle: string;
    note?: string;
  };
  gemini: {
    enabled: boolean;
    placement: string;
  };
}

export interface QuizDefinition {
  schemaVersion: number;
  slug: string;
  title: string;
  subtitle: string;
  status: QuizStatus;
  theme: QuizTheme;
  consent: QuizConsent;
  sources: string[];
  profileQuestions: ProfileQuestion[];
  areas: AreaDefinition[];
  scoredQuestions: ScoredQuestion[];
  scoring: QuizScoring;
  closing: QuizClosing;
  integration: QuizIntegration;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizRevision {
  revisionId: string;
  savedAt: string;
  note?: string;
  definition: QuizDefinition;
}

export interface ScoreResult {
  pointsByQuestion: Record<string, number>;
  areaScores: Record<string, number>;
  areaMaxScores: Record<string, number>;
  areaPcts: Record<string, number>;
  totalPoints: number;
  maxPoints: number;
  readinessPct: number;
  band: ScoringBand;
  biggestGap: string[];
  gapHeadline: string;
  gapTip: string;
}

export interface SubmissionIdentity {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
}

export interface SubmissionDocument {
  id: string;
  slug: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  source: string;
  profile: Record<string, string>;
  answers: Record<string, string>;
  result: ScoreResult;
  priorityFollowup: boolean;
  consentTextVersion: string;
  consentTimestamp: string;
  pageUri: string;
  hutk?: string;
  attempt_count: number;
  first_submitted_at: string;
  last_submitted_at: string;
  last_client_uuid: string;
  gemini_status: GeminiStatus;
  gemini_text: string;
  hubspot_status: HubSpotSyncStatus;
  sync_attempts: number;
  last_sync_at?: string;
  last_sync_error?: string;
}

export interface SyncLogEntry {
  id: string;
  submissionId: string;
  slug: string;
  email: string;
  attempt: number;
  ok: boolean;
  httpStatus: number;
  error?: string;
  createdAt: string;
}
