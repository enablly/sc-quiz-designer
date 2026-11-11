import crypto from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import type {
  QuizDefinition,
  QuizRevision,
  SubmissionDocument,
  SyncLogEntry,
} from "../types.js";
import type { QuizStore } from "./store.js";

export class FirestoreStore implements QuizStore {
  private db: Firestore;

  constructor(projectId?: string) {
    this.db = new Firestore({
      ...(projectId ? { projectId } : {}),
      ignoreUndefinedProperties: true,
    });
  }

  private quizzesCol() {
    return this.db.collection("quizzes");
  }

  private submissionsCol() {
    return this.db.collection("submissions");
  }

  private syncLogCol() {
    return this.db.collection("sync_log");
  }

  async listQuizzes(): Promise<QuizDefinition[]> {
    const snap = await this.quizzesCol().get();
    return snap.docs
      .map((d) => d.data() as QuizDefinition)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  async getQuiz(slug: string): Promise<QuizDefinition | null> {
    const doc = await this.quizzesCol().doc(slug).get();
    if (!doc.exists) return null;
    return doc.data() as QuizDefinition;
  }

  async saveQuiz(def: QuizDefinition, note?: string): Promise<QuizRevision> {
    const now = new Date().toISOString();
    const docRef = this.quizzesCol().doc(def.slug);
    const existingSnap = await docRef.get();
    const existing = existingSnap.exists
      ? (existingSnap.data() as QuizDefinition)
      : null;

    const saved: QuizDefinition = {
      ...structuredClone(def),
      createdAt: existing?.createdAt ?? def.createdAt ?? now,
      updatedAt: now,
    };

    await docRef.set(saved);

    const revId = `rev_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const rev: QuizRevision = {
      revisionId: revId,
      savedAt: now,
      ...(note ? { note } : {}),
      definition: structuredClone(saved),
    };

    const revCol = docRef.collection("revisions");
    await revCol.doc(revId).set(rev);

    // Prune to keep only the latest 10 revisions
    const revSnap = await revCol.orderBy("savedAt", "desc").get();
    if (revSnap.docs.length > 10) {
      const toDelete = revSnap.docs.slice(10);
      await Promise.all(toDelete.map((d) => d.ref.delete()));
    }

    return rev;
  }

  async deleteQuiz(slug: string): Promise<boolean> {
    const docRef = this.quizzesCol().doc(slug);
    const snap = await docRef.get();
    if (!snap.exists) return false;
    const revSnap = await docRef.collection("revisions").get();
    await Promise.all(revSnap.docs.map((d) => d.ref.delete()));
    await docRef.delete();
    return true;
  }

  async listRevisions(slug: string): Promise<QuizRevision[]> {
    const snap = await this.quizzesCol()
      .doc(slug)
      .collection("revisions")
      .orderBy("savedAt", "desc")
      .limit(10)
      .get();
    return snap.docs.map((d) => d.data() as QuizRevision);
  }

  async restoreRevision(
    slug: string,
    revisionId: string,
  ): Promise<QuizDefinition | null> {
    const snap = await this.quizzesCol()
      .doc(slug)
      .collection("revisions")
      .doc(revisionId)
      .get();
    if (!snap.exists) return null;
    const target = snap.data() as QuizRevision;
    const restored = await this.saveQuiz(
      target.definition,
      `Restored from ${revisionId}`,
    );
    return restored.definition;
  }

  async getSubmission(id: string): Promise<SubmissionDocument | null> {
    const doc = await this.submissionsCol().doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as SubmissionDocument;
  }

  async saveSubmission(doc: SubmissionDocument): Promise<void> {
    await this.submissionsCol().doc(doc.id).set(doc);
  }

  async updateSubmission(
    id: string,
    patch: Partial<SubmissionDocument>,
  ): Promise<void> {
    await this.submissionsCol().doc(id).update(patch);
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionDocument[]> {
    const snap = await this.submissionsCol().where("slug", "==", slug).get();
    return snap.docs.map((d) => d.data() as SubmissionDocument);
  }

  async listPendingSubmissions(limit: number): Promise<SubmissionDocument[]> {
    // Query on single field so no manual composite index is required
    const snap = await this.submissionsCol()
      .where("hubspot_status", "==", "pending")
      .get();
    return snap.docs
      .map((d) => d.data() as SubmissionDocument)
      .filter((s) => s.sync_attempts < 5)
      .sort((a, b) => a.last_submitted_at.localeCompare(b.last_submitted_at))
      .slice(0, limit);
  }

  async addSyncLog(entry: SyncLogEntry): Promise<void> {
    await this.syncLogCol().doc(entry.id).set(entry);
  }

  async listSyncLogs(submissionId: string): Promise<SyncLogEntry[]> {
    const snap = await this.syncLogCol()
      .where("submissionId", "==", submissionId)
      .get();
    return snap.docs
      .map((d) => d.data() as SyncLogEntry)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
