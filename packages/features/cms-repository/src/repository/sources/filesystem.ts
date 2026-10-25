import { mkdir, readFile, link, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalizeIJson, parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type { RepositorySourceSnapshot, RepositorySourceStore } from "./interfaces";

export class FilesystemRepositorySourceStore implements RepositorySourceStore {
    constructor(private readonly root: string) {}
    async get(namespace: string, collectionId: string, version: string): Promise<RepositorySourceSnapshot | null> {
        const path = this.path(namespace, collectionId, version);
        try {
            return parseStrictJson(await readFile(path), 4 * 1024 * 1024, 32) as unknown as RepositorySourceSnapshot;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }
    async put(namespace: string, collectionId: string, version: string, snapshot: RepositorySourceSnapshot) {
        const path = this.path(namespace, collectionId, version);
        const bytes = canonicalizeIJson(snapshot);
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
        try {
            try {
                await link(temporary, path);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST" || (await readFile(path, "utf8")) !== bytes) {
                    throw new Error("Source snapshot is immutable");
                }
            }
        } finally {
            await unlink(temporary);
        }
    }
    private path(namespace: string, collectionId: string, version: string) {
        if (
            ![namespace, collectionId, version].every(
                (value) => /^[a-zA-Z0-9][a-zA-Z0-9.+-]{0,95}$/u.test(value) && value !== "." && value !== "..",
            )
        ) {
            throw new Error("Invalid source coordinate");
        }
        return join(this.root, "source-snapshots", namespace, collectionId, `${version}.json`);
    }
}
