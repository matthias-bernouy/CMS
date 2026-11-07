import {
    durableWriteFile,
    ensureDurableDirectory,
    syncDirectory,
} from "cms-repository/repository/filesystem/core/durable";
import { RepositoryRequestError } from "../core/errors";
import { readFile, link, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
    canonicalizeIJson,
    parseStrictJson,
    isResourceId,
    resourcePublisher,
    resourceName,
} from "@bernouy/ulvia-contracts/protocol";
import type { RepositorySourceSnapshot, RepositorySourceStore } from "./interfaces";
import type { ArtifactSourceKind } from "./interfaces";

export class FilesystemRepositorySourceStore implements RepositorySourceStore {
    constructor(private readonly root: string) {}
    async get(namespace: string, collectionId: string, version: string): Promise<RepositorySourceSnapshot | null> {
        const path = this.path(namespace, collectionId, version);
        return this.read(path);
    }
    getArtifact(kind: ArtifactSourceKind, namespace: string, id: string, version: string) {
        return this.read(this.artifactPath(kind, namespace, id, version));
    }
    putArtifact(
        kind: ArtifactSourceKind,
        namespace: string,
        id: string,
        version: string,
        snapshot: RepositorySourceSnapshot,
    ) {
        return this.write(this.artifactPath(kind, namespace, id, version), snapshot);
    }
    private async read(path: string): Promise<RepositorySourceSnapshot | null> {
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
        return this.write(path, snapshot);
    }
    private async write(path: string, snapshot: RepositorySourceSnapshot) {
        const bytes = canonicalizeIJson(snapshot);
        await ensureDurableDirectory(dirname(path), this.root);
        const temporary = `${path}.${randomUUID()}.tmp`;
        try {
            await durableWriteFile(temporary, bytes, { mode: 0o600, flag: "wx" });
            try {
                await link(temporary, path);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw error;
                }
                if ((await readFile(path, "utf8")) !== bytes) {
                    throw new RepositoryRequestError("REJECTED", "Source snapshot is immutable");
                }
            }
            await syncDirectory(dirname(path));
        } finally {
            await rm(temporary, { force: true });
        }
    }
    private path(namespace: string, collectionId: string, version: string) {
        if (
            !isResourceId(collectionId) ||
            resourcePublisher(collectionId) !== namespace ||
            ![namespace, version].every(
                (value) => /^[a-zA-Z0-9][a-zA-Z0-9.+-]{0,95}$/u.test(value) && value !== "." && value !== "..",
            )
        ) {
            throw new RepositoryRequestError("REJECTED", "Invalid source coordinate");
        }
        return join(this.root, "source-snapshots", namespace, resourceName(collectionId), `${version}.json`);
    }
    private artifactPath(kind: ArtifactSourceKind, namespace: string, id: string, version: string) {
        this.path(namespace, id, version);
        if (kind !== "contract" && kind !== "provider-manifest") {
            throw new RepositoryRequestError("REJECTED", "Invalid source kind");
        }
        return join(this.root, "artifact-source-snapshots", kind, namespace, resourceName(id), `${version}.json`);
    }
}
