import { readFile } from "node:fs/promises";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/cms-repository/contracts";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { scanJsonSourceTree, type SourceFile } from "./sourceTree";

export type JsonSourceRecord = Readonly<{
    source: string;
    value: Record<string, unknown>;
}>;

export async function readJsonSourceRecord(path: string, source: string): Promise<JsonSourceRecord> {
    const bytes = await readFile(path);
    const value = parseStrictJson(bytes, DEFAULT_RELEASE_LIMITS.maxDocumentBytes, DEFAULT_RELEASE_LIMITS.maxJsonDepth);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source} must contain a JSON object`);
    }
    return { source, value: value as Record<string, unknown> };
}

export async function readOptionalJsonSourceRecord(
    path: string,
    source: string,
): Promise<JsonSourceRecord | undefined> {
    try {
        return await readJsonSourceRecord(path, source);
    } catch (error) {
        if (isMissing(error)) {
            return undefined;
        }
        throw error;
    }
}

export async function readJsonSourceTree(root: string, label: string): Promise<JsonSourceRecord[] | undefined> {
    let files: SourceFile[];
    try {
        files = await scanJsonSourceTree(root);
    } catch (error) {
        if (isMissing(error)) {
            return undefined;
        }
        throw error;
    }
    const records: JsonSourceRecord[] = [];
    for (const file of files) {
        records.push(await readJsonSourceRecord(file.absolutePath, `${label}/${file.relativePath}`));
    }
    return records;
}

export function sourceId(record: JsonSourceRecord, field: string): string {
    const value = record.value[field];
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${record.source} must declare a nonempty string ${field}`);
    }
    return value;
}

export function assertUniqueSourceIds(records: readonly JsonSourceRecord[], field: string, label: string): void {
    const sources = new Map<string, string>();
    for (const record of records) {
        const id = sourceId(record, field);
        const previous = sources.get(id);
        if (previous) {
            throw new Error(`${label} ${JSON.stringify(id)} is declared by both ${previous} and ${record.source}`);
        }
        sources.set(id, record.source);
    }
}

export function compareOrdinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
