import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
    documentationPath,
    DOCUMENTATION_LIMITS,
    parseDocumentationMarkdown,
} from "@bernouy/cms-repository/contracts/documentation";
import type { ContractDocumentationDefinition } from "@bernouy/cms-repository/contracts";

export async function readDocumentationSource(directory: string) {
    const documents: ContractDocumentationDefinition[] = [];
    const assets: { id: string; bytes: Uint8Array }[] = [];
    let total = 0;
    let nodes = 0;
    async function scan(relative: string): Promise<void> {
        let entries;
        try {
            const target = join(directory, "docs", relative);
            if (!(await lstat(target)).isDirectory()) {
                throw new Error("Documentation sources must be directories without symbolic links");
            }
            entries = await readdir(target, { withFileTypes: true });
        } catch (error) {
            if (!relative && (error as NodeJS.ErrnoException).code === "ENOENT") {
                return;
            }
            throw error;
        }
        for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
            if (++nodes > 1024) {
                throw new Error("Documentation source entry limit exceeded");
            }
            if (entry.isSymbolicLink()) {
                throw new Error("Documentation sources cannot contain symbolic links");
            }
            const path = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (path.split("/").length > 8) {
                    throw new Error("Documentation source depth exceeds limit");
                }
                await scan(path);
                continue;
            }
            documentationPath(path);
            if (!entry.isFile() || documents.length >= DOCUMENTATION_LIMITS.documents) {
                throw new Error("Invalid or excessive documentation sources");
            }
            const handle = await open(join(directory, "docs", path), constants.O_RDONLY | constants.O_NOFOLLOW);
            let bytes: Uint8Array;
            try {
                const info = await handle.stat();
                if (
                    !info.isFile() ||
                    info.size > DOCUMENTATION_LIMITS.documentBytes ||
                    (total += info.size) > DOCUMENTATION_LIMITS.totalBytes
                ) {
                    throw new Error("Documentation byte limit exceeded");
                }
                bytes = await handle.readFile();
            } finally {
                await handle.close();
            }
            const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            const { title } = parseDocumentationMarkdown(text);
            const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
            const digest =
                `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}` as const;
            documents.push({ path, title, byteLength: bytes.byteLength, digest });
            assets.push({ id: `docs/${path}`, bytes });
        }
    }
    await scan("");
    return { documents, assets };
}
