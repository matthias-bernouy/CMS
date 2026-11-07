import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCUMENTATION_LIMITS, documentationPath } from "@bernouy/ulvia-contracts/documentation";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

const ENTRY_LIMIT = 1024;
const DEPTH_LIMIT = 8;

/** Build-time only: capture bounded, UTF-8 Markdown sources before asynchronous admission. */
export function readDocumentDirectory(directory: URL): Readonly<Record<string, string>> {
    if (directory.protocol !== "file:" || directory.search || directory.hash) {
        throw failure("Documentation directory must be a plain file URL");
    }
    const root = fileURLToPath(directory);
    const documents: Record<string, string> = Object.create(null);
    let entriesSeen = 0;
    let count = 0;
    let total = 0;
    function scan(relative: string, depth: number): void {
        const target = join(root, relative);
        if (depth > DEPTH_LIMIT || !lstatSync(target).isDirectory()) {
            throw failure("Documentation sources must be real directories within the depth limit", relative);
        }
        const handle = opendirSync(target);
        const entries: Dirent[] = [];
        try {
            for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
                if (++entriesSeen > ENTRY_LIMIT) {
                    throw failure("Documentation source entry limit exceeded", relative);
                }
                entries.push(entry);
            }
        } finally {
            handle.closeSync();
        }
        entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        for (const entry of entries) {
            const path = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isSymbolicLink()) {
                throw failure("Documentation sources cannot contain symbolic links", path);
            }
            if (entry.isDirectory()) {
                scan(path, depth + 1);
                continue;
            }
            if (!entry.isFile()) {
                throw failure("Documentation sources must be regular files", path);
            }
            if (!entry.name.endsWith(".md")) {
                continue;
            }
            documentationPath(path);
            if (++count > DOCUMENTATION_LIMITS.documents) {
                throw failure("Too many documentation sources", path);
            }
            const bytes = readMarkdown(join(root, path), DOCUMENTATION_LIMITS.totalBytes - total);
            total += bytes.byteLength;
            documents[path] = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        }
    }
    scan("", 0);
    return documents;
}

function readMarkdown(path: string, remaining: number): Uint8Array {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const before = fstatSync(fd);
        if (!before.isFile() || before.size > Math.min(DOCUMENTATION_LIMITS.documentBytes, remaining)) {
            throw failure("Documentation byte limit exceeded", path);
        }
        // One extra byte detects growth without allowing an unbounded readFile allocation.
        const bytes = new Uint8Array(before.size + 1);
        let length = 0;
        while (length < bytes.byteLength) {
            const read = readSync(fd, bytes, length, bytes.byteLength - length, null);
            if (!read) {
                break;
            }
            length += read;
        }
        const after = fstatSync(fd);
        if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
            throw failure("Documentation source changed while reading", path);
        }
        return bytes.subarray(0, length);
    } finally {
        closeSync(fd);
    }
}

function failure(message: string, path = ""): SdkDefinitionError {
    return new SdkDefinitionError(message, path ? `$.documents[${JSON.stringify(path)}]` : "$.documents");
}
