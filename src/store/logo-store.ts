import { Storage } from "@google-cloud/storage";

export interface StoredLogoObject {
  buffer: Buffer;
  contentType: string;
}

export interface LogoStore {
  putLogo(objectKey: string, buffer: Buffer, contentType: string): Promise<void>;
  getLogo(objectKey: string): Promise<StoredLogoObject | null>;
  copyLogo(sourceObjectKey: string, destObjectKey: string): Promise<boolean>;
  deleteLogo(objectKey: string): Promise<void>;
}

export class MemoryLogoStore implements LogoStore {
  private readonly objects = new Map<string, StoredLogoObject>();

  async putLogo(objectKey: string, buffer: Buffer, contentType: string): Promise<void> {
    this.objects.set(objectKey, {
      buffer: Buffer.from(buffer),
      contentType,
    });
  }

  async getLogo(objectKey: string): Promise<StoredLogoObject | null> {
    const found = this.objects.get(objectKey);
    if (!found) return null;
    return {
      buffer: Buffer.from(found.buffer),
      contentType: found.contentType,
    };
  }

  async copyLogo(sourceObjectKey: string, destObjectKey: string): Promise<boolean> {
    const src = this.objects.get(sourceObjectKey);
    if (!src) return false;
    this.objects.set(destObjectKey, {
      buffer: Buffer.from(src.buffer),
      contentType: src.contentType,
    });
    return true;
  }

  async deleteLogo(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }
}

export class GcsLogoStore implements LogoStore {
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(bucketName: string, projectId?: string) {
    this.storage = new Storage(projectId ? { projectId } : undefined);
    this.bucketName = bucketName;
  }

  private get bucket() {
    return this.storage.bucket(this.bucketName);
  }

  async putLogo(objectKey: string, buffer: Buffer, contentType: string): Promise<void> {
    const file = this.bucket.file(objectKey);
    await file.save(buffer, {
      resumable: false,
      contentType,
      metadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }

  async getLogo(objectKey: string): Promise<StoredLogoObject | null> {
    const file = this.bucket.file(objectKey);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();
    return {
      buffer,
      contentType: String(metadata.contentType || "application/octet-stream"),
    };
  }

  async copyLogo(sourceObjectKey: string, destObjectKey: string): Promise<boolean> {
    const srcFile = this.bucket.file(sourceObjectKey);
    const [exists] = await srcFile.exists();
    if (!exists) return false;
    await srcFile.copy(this.bucket.file(destObjectKey));
    return true;
  }

  async deleteLogo(objectKey: string): Promise<void> {
    await this.bucket.file(objectKey).delete({ ignoreNotFound: true });
  }
}
