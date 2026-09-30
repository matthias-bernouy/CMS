import { randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { admitCollectionReleaseJson, type AdmittedCollectionRelease } from "@bernouy/cms-repository/collections";

export class LocalCollectionRepository {
    constructor(private readonly root: string) {}

    async store(artifact: AdmittedCollectionRelease): Promise<boolean> {
        const { publisherId, collectionId, version } = artifact.release;
        const path = this.releasePath(publisherId, collectionId, version);
        const existing = await this.get(publisherId, collectionId, version);
        if (existing) {
            return assertSameDigest(existing, artifact);
        }
        const directory = join(this.root, "releases", publisherId, collectionId);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = join(directory, `.${randomUUID()}.tmp`);
        await writeFile(temporary, artifact.canonicalJson, { flag: "wx", mode: 0o600 });
        try {
            await link(temporary, path);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
            const winner = await this.get(publisherId, collectionId, version);
            if (!winner) {
                throw new Error("Concurrent release disappeared");
            }
            return assertSameDigest(winner, artifact);
        } finally {
            await rm(temporary, { force: true });
        }
    }

    async list(): Promise<AdmittedCollectionRelease[]> {
        const releases: AdmittedCollectionRelease[] = [];
        for (const publisher of await directories(join(this.root, "releases"))) {
            for (const collection of await directories(join(this.root, "releases", publisher))) {
                const folder = join(this.root, "releases", publisher, collection);
                for (const entry of await readdir(folder, { withFileTypes: true })) {
                    if (!entry.isFile() || !entry.name.endsWith(".json")) {
                        continue;
                    }
                    const version = entry.name.slice(0, -5);
                    const artifact = await this.get(publisher, collection, version);
                    if (!artifact) {
                        throw new Error(`Release disappeared: ${publisher}/${collection}/${version}`);
                    }
                    releases.push(artifact);
                }
            }
        }
        return releases.sort((left, right) => coordinate(left).localeCompare(coordinate(right)));
    }

    async get(publisherId: string, collectionId: string, version: string): Promise<AdmittedCollectionRelease | null> {
        if (!IDENTIFIER.test(publisherId) || !IDENTIFIER.test(collectionId) || !VERSION.test(version)) {
            return null;
        }
        const path = this.releasePath(publisherId, collectionId, version);
        const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (!bytes) {
            return null;
        }
        const artifact = await admitCollectionReleaseJson(bytes);
        if (
            artifact.release.publisherId !== publisherId ||
            artifact.release.collectionId !== collectionId ||
            artifact.release.version !== version ||
            artifact.canonicalJson !== bytes.toString("utf8")
        ) {
            throw new Error(`Corrupt local release: ${publisherId}/${collectionId}/${version}`);
        }
        return artifact;
    }

    async prune(): Promise<void> {
        const root = await lstat(this.root);
        if (!root.isDirectory() || root.isSymbolicLink()) {
            throw new Error("Local repository root must be a real directory");
        }
        for (const name of await readdir(this.root)) {
            const path = join(this.root, name);
            await makeDirectoryTreeRemovable(path);
            await rm(path, { recursive: true, force: true });
        }
    }

    private releasePath(publisherId: string, collectionId: string, version: string): string {
        return join(this.root, "releases", publisherId, collectionId, `${version}.json`);
    }
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function assertSameDigest(existing: AdmittedCollectionRelease, candidate: AdmittedCollectionRelease): false {
    if (existing.digest !== candidate.digest) {
        throw new Error(`Release ${coordinate(candidate)} already exists with different content`);
    }
    return false;
}

function coordinate(artifact: AdmittedCollectionRelease): string {
    const { publisherId, collectionId, version } = artifact.release;
    return `${publisherId}/${collectionId}/${version}`;
}

async function directories(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

async function makeDirectoryTreeRemovable(path: string): Promise<void> {
    const entry = await lstat(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
        return;
    }
    await chmod(path, entry.mode | 0o700);
    for (const name of await readdir(path)) {
        await makeDirectoryTreeRemovable(join(path, name));
    }
}
