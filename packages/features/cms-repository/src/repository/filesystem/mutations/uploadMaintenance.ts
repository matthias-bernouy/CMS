import { join } from "node:path";
import { ensureDurableDirectory } from "../core/durable";
import { withRepositoryWriteLock } from "../core/lock";
import {
    advanceUploadQueue,
    appendQueuedUploads,
    readQueuedUpload,
    UPLOAD_MAINTENANCE_BATCH,
} from "./uploadQueueRecords";
import { discardUploadQueuePages, readUploadQueue, sameUploadPosition, writeUploadQueue } from "./uploadQueueState";
import type { UploadQueueState } from "./uploadQueueState";

export { UPLOAD_MAINTENANCE_BATCH } from "./uploadQueueRecords";

/** A persistent bounded-work queue avoids directory enumeration, including Bun's eager opendir. */
export class UploadMaintenance {
    private readonly directory: string;
    private pending?: Promise<void>;
    private closing?: Promise<void>;

    constructor(
        private readonly root: string,
        private readonly prune: (uploadId: string) => Promise<boolean>,
    ) {
        this.directory = join(root, ".publication-upload-queue");
    }

    run(): Promise<void> {
        if (this.closing) {
            return Promise.reject(new Error("Publication upload maintenance is closed"));
        }
        this.pending ??= this.sweep().finally(() => {
            this.pending = undefined;
        });
        return this.pending;
    }

    close(): Promise<void> {
        this.closing ??= Promise.resolve().then(() => this.pending);
        return this.closing;
    }

    /** Persist enrollment before creating staging, while excluding cleanup of incomplete creation. */
    async enroll<T>(id: string, create: () => Promise<T>): Promise<T> {
        if (this.closing) {
            throw new Error("Publication upload maintenance is closed");
        }
        return this.locked(async (state) => {
            const tail = await appendQueuedUploads(this.directory, state.tail, [id]);
            await writeUploadQueue(this.directory, { ...state, tail, discard: [] });
            return create();
        });
    }

    private async sweep(): Promise<void> {
        await this.locked(async (state) => {
            if (sameUploadPosition(state.head, state.tail)) {
                if (state.discard.length) {
                    await writeUploadQueue(this.directory, { ...state, discard: [] });
                }
                return;
            }
            let head = state.head;
            const retained: string[] = [];
            for (let count = 0; count < UPLOAD_MAINTENANCE_BATCH && !sameUploadPosition(head, state.tail); count++) {
                const id = await readQueuedUpload(this.directory, head);
                if (await this.prune(id)) {
                    retained.push(id);
                }
                head = advanceUploadQueue(head);
            }
            let tail = await appendQueuedUploads(this.directory, state.tail, retained);
            const discard = [];
            for (let page = state.head.page; page < head.page; page++) {
                discard.push(page);
            }
            if (sameUploadPosition(head, tail)) {
                discard.push(head.page);
                head = { page: 0, offset: 0 };
                tail = head;
            }
            const next = { head, tail, discard };
            await writeUploadQueue(this.directory, next);
            await discardUploadQueuePages(this.directory, next);
        });
    }

    private async locked<T>(operation: (state: UploadQueueState) => Promise<T>): Promise<T> {
        await ensureDurableDirectory(this.directory, this.root);
        return withRepositoryWriteLock(this.directory, async () => {
            const state = await readUploadQueue(this.directory);
            await discardUploadQueuePages(this.directory, state);
            return operation(state);
        });
    }
}
