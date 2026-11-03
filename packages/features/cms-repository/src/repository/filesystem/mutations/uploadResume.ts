import { createHash, randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { join } from "node:path";
import type { OwnedPublicationUploadManifest, PublicationUploadReceipt } from "../../publication/types";
import { durableRename, durableWriteFile, ensureDurableDirectory } from "../core/durable";
import { withRepositoryWriteLock } from "../core/lock";

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function isPublicationUploadId(value: unknown): value is string {
    return typeof value === "string" && UPLOAD_ID.test(value);
}

export function uploadManifestFingerprint(manifest: OwnedPublicationUploadManifest): string {
    return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

/** One derived pointer per exact manifest/account/revision, serialized across local processes. */
export async function withUploadResume(
    root: string,
    fingerprint: string,
    prepare: (candidate: string | null) => Promise<PublicationUploadReceipt>,
): Promise<PublicationUploadReceipt> {
    if (!/^[a-f0-9]{64}$/u.test(fingerprint)) {
        throw new TypeError("Invalid publication upload fingerprint");
    }
    const directory = join(root, ".publication-upload-resume");
    await ensureDurableDirectory(directory, root);
    return withRepositoryWriteLock(join(directory, fingerprint), async () => {
        const pointer = join(directory, fingerprint, "upload-id");
        const candidate = await readPointer(pointer);
        const receipt = await prepare(candidate);
        if (!isPublicationUploadId(receipt.uploadId)) {
            throw new TypeError("Invalid publication upload ID");
        }
        if (receipt.uploadId !== candidate) {
            const temporary = `${pointer}.${randomUUID()}.tmp`;
            try {
                await durableWriteFile(temporary, receipt.uploadId, { flag: "wx" });
                await durableRename(temporary, pointer);
            } finally {
                await rm(temporary, { force: true });
            }
        }
        return receipt;
    });
}

async function readPointer(path: string): Promise<string | null> {
    const file = await open(path, "r").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!file) {
        return null;
    }
    try {
        const buffer = Buffer.alloc(37);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        const value = buffer.toString("utf8", 0, bytesRead);
        return isPublicationUploadId(value) ? value : null;
    } finally {
        await file.close();
    }
}
