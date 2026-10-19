import { open, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { LOG_LEVELS, type LogLevel, type LogRecord } from "@bernouy/logging";
import type { UlviaPaths } from "../../paths";
import type { DevLogService } from "./selection";

const STABLE_IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

type JournalCursor = {
    offset: number;
    remainder: Buffer;
    lastSeen: number;
};

export type DevLogCursor = Map<string, JournalCursor>;

export async function readDevLogRecords(
    paths: UlviaPaths,
    services: readonly DevLogService[],
    cursor: DevLogCursor,
): Promise<LogRecord[]> {
    const names = await readdir(paths.logs).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    const records: LogRecord[] = [];
    const now = Date.now();
    for (const name of names.filter((entry) => isSelectedJournal(entry, services))) {
        records.push(...(await readJournal(join(paths.logs, name), cursor, now)));
    }
    pruneCursor(cursor, now);
    return records;
}

async function readJournal(file: string, cursor: DevLogCursor, now: number): Promise<LogRecord[]> {
    let handle;
    try {
        handle = await open(file, "r");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        throw error;
    }
    try {
        const stats = await handle.stat();
        const identity = `${stats.dev}:${stats.ino}:${stats.birthtimeMs}`;
        const previous = cursor.get(identity);
        const offset = previous && stats.size >= previous.offset ? previous.offset : 0;
        const remainder = offset === 0 ? Buffer.alloc(0) : (previous?.remainder ?? Buffer.alloc(0));
        const length = stats.size - offset;
        if (length === 0) {
            cursor.set(identity, { offset, remainder, lastSeen: now });
            return [];
        }
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        const content = Buffer.concat([remainder, buffer.subarray(0, bytesRead)]);
        const lines: string[] = [];
        let lineStart = 0;
        for (let index = content.indexOf(0x0a); index >= 0; index = content.indexOf(0x0a, lineStart)) {
            lines.push(content.subarray(lineStart, index).toString("utf8"));
            lineStart = index + 1;
        }
        cursor.set(identity, {
            offset: offset + bytesRead,
            remainder: Buffer.from(content.subarray(lineStart)),
            lastSeen: now,
        });
        return parseLines(lines, file, now);
    } finally {
        await handle.close();
    }
}

function parseLines(lines: readonly string[], file: string, now: number): LogRecord[] {
    const records: LogRecord[] = [];
    let invalidRecords = 0;
    for (const line of lines) {
        if (!line) {
            continue;
        }
        const record = parseRecord(line);
        if (record) {
            records.push(record);
        } else {
            invalidRecords += 1;
        }
    }
    if (invalidRecords > 0) {
        records.push({
            time: new Date(now).toISOString(),
            level: "warn",
            service: "ulvia-dev",
            event: "logging.journal.invalid-record",
            attributes: { journal: basename(file), invalidRecords },
        });
    }
    return records;
}

function parseRecord(source: string): LogRecord | null {
    try {
        const value = JSON.parse(source) as Partial<LogRecord>;
        return typeof value.time === "string" &&
            ISO_TIMESTAMP.test(value.time) &&
            typeof value.event === "string" &&
            STABLE_IDENTIFIER.test(value.event) &&
            typeof value.service === "string" &&
            STABLE_IDENTIFIER.test(value.service) &&
            LOG_LEVELS.includes(value.level as LogLevel) &&
            isValidError(value.error) &&
            isValidAttributes(value.attributes)
            ? (value as LogRecord)
            : null;
    } catch {
        return null;
    }
}

function isValidError(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const error = value as Record<string, unknown>;
    return (
        typeof error.name === "string" &&
        typeof error.message === "string" &&
        (error.stack === undefined || typeof error.stack === "string")
    );
}

function isValidAttributes(value: unknown): boolean {
    return value === undefined || (!!value && typeof value === "object" && !Array.isArray(value));
}

function isSelectedJournal(name: string, services: readonly DevLogService[]): boolean {
    return services.some((service) => {
        const base = `${service}.ndjson`;
        return name === base || (name.startsWith(`${base}.`) && /^\d+$/u.test(name.slice(base.length + 1)));
    });
}

function pruneCursor(cursor: DevLogCursor, now: number): void {
    if (cursor.size <= 64) {
        return;
    }
    const stale = [...cursor.entries()]
        .filter(([, value]) => now - value.lastSeen > 5_000)
        .sort((left, right) => left[1].lastSeen - right[1].lastSeen);
    for (const [identity] of stale.slice(0, cursor.size - 64)) {
        cursor.delete(identity);
    }
}
