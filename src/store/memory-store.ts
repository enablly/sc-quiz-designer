import crypto from "node:crypto";
import type {
  QuizDefinition,
  QuizRevision,
  SubmissionDocument,
  SyncLogEntry,
} from "../types.js";
import type { QuizStore } from "./store.js";

export class MemoryStore implements QuizStore {
  private quizzes = new Map<string, QuizDefinition>();
  private revisions = new Map<string, QuizRevision[]>();
  private submissions = new Map<string, SubmissionDocument>();
  private syncLogs: SyncLogEntry[] = [];

  async listQuizzes(): Promise<QuizDefinition[]> {
    return [...this.quizzes.values()]
      .map((q) => structuredClone(q))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  async getQuiz(slug: string): Promise<QuizDefinition | null> {
    const q = this.quizzes.get(slug);
    return q ? structuredClone(q) : null;
  }

  async saveQuiz(def: QuizDefinition, note?: string): Promise<QuizRevision> {
    const now = new Date().toISOString();
    const existing = this.quizzes.get(def.slug);
    const saved: QuizDefinition = {
      ...structuredClone(def),
      createdAt: existing?.createdAt ?? def.createdAt ?? now,
      updatedAt: now,
    };
    this.quizzes.set(saved.slug, saved);

    const rev: QuizRevision = {
      revisionId: `rev_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      savedAt: now,
      ...(note ? { note } : {}),
      definition: structuredClone(saved),
    };
    const list = this.revisions.get(saved.slug) ?? [];
    list.unshift(rev);
    if (list.length > 10) list.length = 10;
    this.revisions.set(saved.slug, list);
    return structuredClone(rev);
  }

  async deleteQuiz(slug: string): Promise<boolean> {
    const existed = this.quizzes.delete(slug);
    this.revisions.delete(slug);
    return existed;
  }

  async listRevisions(slug: string): Promise<QuizRevision[]> {
    return (this.revisions.get(slug) ?? []).map((r) => structuredClone(r));
  }

  async restoreRevision(
    slug: string,
    revisionId: string,
  ): Promise<QuizDefinition | null> {
    const list = this.revisions.get(slug) ?? [];
    const target = list.find((r) => r.revisionId === revisionId);
    if (!target) return null;
    const rev = await this.saveQuiz(target.definition, `Restored from ${revisionId}`);
    return structuredClone(rev.definition);
  }

  async getSubmission(id: string): Promise<SubmissionDocument | null> {
    const sub = this.submissions.get(id);
    return sub ? structuredClone(sub) : null;
  }

  async saveSubmission(doc: SubmissionDocument): Promise<void> {
    this.submissions.set(doc.id, structuredClone(doc));
  }

  async updateSubmission(
    id: string,
    patch: Partial<SubmissionDocument>,
  ): Promise<void> {
    const existing = this.submissions.get(id);
    if (!existing) return;
    this.submissions.set(id, structuredClone({ ...existing, ...patch }));
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionDocument[]> {
    return [...this.submissions.values()]
      .filter((s) => s.slug === slug)
      .map((s) => structuredClone(s));
  }

  async listPendingSubmissions(limit: number): Promise<SubmissionDocument[]> {
    return [...this.submissions.values()]
      .filter((s) => s.hubspot_status === "pending" && s.sync_attempts < 5)
      .sort((a, b) => a.last_submitted_at.localeCompare(b.last_submitted_at))
      .slice(0, limit)
      .map((s) => structuredClone(s));
  }

  async addSyncLog(entry: SyncLogEntry): Promise<void> {
    this.syncLogs.push(structuredClone(entry));
  }

  async listSyncLogs(submissionId: string): Promise<SyncLogEntry[]> {
    return this.syncLogs
      .filter((l) => l.submissionId === submissionId)
      .map((l) => structuredClone(l));
  }
}
