import type {
  QuizDefinition,
  QuizRevision,
  SubmissionDocument,
  SyncLogEntry,
} from "../types.js";

export function submissionDocId(slug: string, email: string): string {
  return `${slug}__${encodeURIComponent(email.trim().toLowerCase())}`;
}

export interface QuizStore {
  listQuizzes(): Promise<QuizDefinition[]>;
  getQuiz(slug: string): Promise<QuizDefinition | null>;
  saveQuiz(def: QuizDefinition, note?: string): Promise<QuizRevision>;
  deleteQuiz(slug: string): Promise<boolean>;
  listRevisions(slug: string): Promise<QuizRevision[]>;
  restoreRevision(slug: string, revisionId: string): Promise<QuizDefinition | null>;

  getSubmission(id: string): Promise<SubmissionDocument | null>;
  saveSubmission(doc: SubmissionDocument): Promise<void>;
  updateSubmission(id: string, patch: Partial<SubmissionDocument>): Promise<void>;
  listSubmissionsBySlug(slug: string): Promise<SubmissionDocument[]>;
  listPendingSubmissions(limit: number): Promise<SubmissionDocument[]>;

  addSyncLog(entry: SyncLogEntry): Promise<void>;
  listSyncLogs(submissionId: string): Promise<SyncLogEntry[]>;
}
