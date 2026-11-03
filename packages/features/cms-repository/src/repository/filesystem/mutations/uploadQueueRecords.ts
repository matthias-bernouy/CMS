import { open } from "node:fs/promises";
import { join } from "node:path";
import { isPublicationUploadId } from "./uploadResume";
import { syncDirectory } from "../core/durable";

export const UPLOAD_QUEUE_PAGE_SIZE = 256;
export const UPLOAD_MAINTENANCE_BATCH = 8;
const RECORD_BYTES = 37;
export type UploadQueuePosition = Readonly<{ page: number; offset: number }>;

export function advanceUploadQueue(position: UploadQueuePosition, count = 1): UploadQueuePosition {
    const total = position.offset + count;
    const page = position.page + Math.floor(total / UPLOAD_QUEUE_PAGE_SIZE);
    if (!Number.isSafeInteger(page)) {
        throw new Error("Publication upload queue position overflow");
    }
    return { page, offset: total % UPLOAD_QUEUE_PAGE_SIZE };
}

export async function readQueueBytes(path: string, length: number, position = 0): Promise<Buffer | null> {
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
        const bytes = Buffer.alloc(length);
        let loaded = 0;
        while (loaded < length) {
            const { bytesRead } = await file.read(bytes, loaded, length - loaded, position + loaded);
            if (bytesRead === 0) {
                break;
            }
            loaded += bytesRead;
        }
        return bytes.subarray(0, loaded);
    } finally {
        await file.close();
    }
}

export async function readQueuedUpload(root: string, position: UploadQueuePosition): Promise<string> {
    const bytes = await readQueueBytes(
        join(root, `${position.page}.ids`),
        RECORD_BYTES,
        position.offset * RECORD_BYTES,
    );
    const id = bytes?.subarray(0, 36).toString("utf8");
    if (bytes?.length !== RECORD_BYTES || bytes[36] !== 10 || !isPublicationUploadId(id)) {
        throw new Error("Invalid publication upload queue record");
    }
    return id;
}

/** At most eight fixed-size records and two page files are written in one operation. */
export async function appendQueuedUploads(root: string, supplied: UploadQueuePosition, ids: readonly string[]) {
    if (ids.length > UPLOAD_MAINTENANCE_BATCH || ids.some((id) => !isPublicationUploadId(id))) {
        throw new TypeError("Invalid publication upload queue batch");
    }
    let position = supplied;
    for (let start = 0; start < ids.length; ) {
        const count = Math.min(ids.length - start, UPLOAD_QUEUE_PAGE_SIZE - position.offset);
        const bytes = Buffer.from(`${ids.slice(start, start + count).join("\n")}\n`);
        const path = join(root, `${position.page}.ids`);
        let created = false;
        const file = await open(path, "r+").catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") {
                throw error;
            }
            created = true;
            return open(path, "wx", 0o600);
        });
        try {
            let written = 0;
            while (written < bytes.length) {
                const result = await file.write(
                    bytes,
                    written,
                    bytes.length - written,
                    position.offset * RECORD_BYTES + written,
                );
                if (result.bytesWritten === 0) {
                    throw new Error("Publication upload queue write did not progress");
                }
                written += result.bytesWritten;
            }
            await file.sync();
        } finally {
            await file.close();
        }
        if (created) {
            await syncDirectory(root);
        }
        position = advanceUploadQueue(position, count);
        start += count;
    }
    return position;
}
