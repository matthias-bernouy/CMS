import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { UploadQueuePosition } from "./uploadQueueRecords";
import {
    readQueueBytes,
    UPLOAD_QUEUE_PAGE_SIZE,
} from "cms-repository/repository/filesystem/mutations/uploadQueueRecords";
import { durableRename, durableWriteFile, syncDirectory } from "../core/durable";

const SCHEMA = "ulvia.upload-queue.v1";
export type UploadQueueState = Readonly<{
    head: UploadQueuePosition;
    tail: UploadQueuePosition;
    discard: readonly number[];
}>;

export function sameUploadPosition(left: UploadQueuePosition, right: UploadQueuePosition): boolean {
    return left.page === right.page && left.offset === right.offset;
}

export async function readUploadQueue(root: string): Promise<UploadQueueState> {
    const bytes = await readQueueBytes(join(root, "state.json"), 1025);
    if (!bytes) {
        return { head: { page: 0, offset: 0 }, tail: { page: 0, offset: 0 }, discard: [] };
    }
    if (bytes.length > 1024) {
        throw new Error("Publication upload queue state exceeds its bound");
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).toSorted().join(",") !== "discard,head,schema,tail" ||
        value.schema !== SCHEMA ||
        !validPosition(value.head) ||
        !validPosition(value.tail) ||
        value.head.page > value.tail.page ||
        (value.head.page === value.tail.page && value.head.offset > value.tail.offset) ||
        !Array.isArray(value.discard) ||
        value.discard.length > 2 ||
        new Set(value.discard).size !== value.discard.length ||
        value.discard.some((page: unknown) => typeof page !== "number" || !Number.isSafeInteger(page) || page < 0) ||
        (!sameUploadPosition(value.head, value.tail) &&
            value.discard.some((page: number) => page >= value.head.page && page <= value.tail.page))
    ) {
        throw new Error("Invalid publication upload queue state");
    }
    return value;
}

function validPosition(value: unknown): value is UploadQueuePosition {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const position = value as Record<string, unknown>;
    return (
        Object.keys(position).toSorted().join(",") === "offset,page" &&
        typeof position.page === "number" &&
        Number.isSafeInteger(position.page) &&
        position.page >= 0 &&
        typeof position.offset === "number" &&
        Number.isSafeInteger(position.offset) &&
        position.offset >= 0 &&
        position.offset < UPLOAD_QUEUE_PAGE_SIZE
    );
}

export async function writeUploadQueue(root: string, state: UploadQueueState): Promise<void> {
    const path = join(root, "state.json");
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
        await durableWriteFile(temporary, JSON.stringify({ schema: SCHEMA, ...state }), { flag: "wx" });
        await durableRename(temporary, path);
    } finally {
        await rm(temporary, { force: true });
    }
}

/** A durable list of at most two obsolete pages makes interrupted queue compaction resumable. */
export async function discardUploadQueuePages(root: string, state: UploadQueueState): Promise<void> {
    for (const page of state.discard) {
        await rm(join(root, `${page}.ids`), { force: true });
    }
    if (state.discard.length) {
        await syncDirectory(root);
    }
}
