import { createHash, randomUUID } from "node:crypto";
import { link, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stat } from "node:fs/promises";
import { durableWriteFile, ensureDurableDirectory, syncDirectory } from "../core/durable";

export type ArtifactType = "contracts" | "providers";
export type StoredArtifact = {
    publisherId: string;
    id: string;
    version: string;
    bytes: Buffer;
    publishedAt: string;
};
export type LocalFixtureAsset = { id: string; bytes: Uint8Array | Blob };

/** Immutable files for locally published contract and provider artifacts. */
export class LocalArtifactFiles {
    constructor(private readonly root: string) {}

    async store(
        type: ArtifactType,
        publisherId: string,
        id: string,
        version: string,
        canonicalJson: string,
        fixtures: readonly LocalFixtureAsset[] = [],
    ): Promise<boolean> {
        const path = this.path(type, publisherId, id, version);
        const existing = await this.get(type, publisherId, id, version);
        if (existing) {
            return sameBytes(existing, canonicalJson, type, id, version);
        }
        const directory = join(this.root, type, publisherId, id);
        await ensureDurableDirectory(directory, this.root);
        if (fixtures.length) {
            const fixtureRoot = join(this.root, "assets", "contracts", releaseHash(canonicalJson));
            await ensureDurableDirectory(fixtureRoot, this.root);
            for (const fixture of fixtures) {
                if (!IDENTIFIER.test(fixture.id)) {
                    throw new Error("Invalid fixture asset ID");
                }
                await writeImmutable(join(fixtureRoot, fixture.id), fixture.bytes);
            }
        }
        await writeImmutable(path, Buffer.from(canonicalJson));
        return true;
    }

    async fixture(canonicalJson: string, assetId: string): Promise<Buffer> {
        if (!IDENTIFIER.test(assetId)) {
            throw new Error("Invalid fixture asset ID");
        }
        return readFile(join(this.root, "assets", "contracts", releaseHash(canonicalJson), assetId));
    }

    fixtureBlob(canonicalJson: string, assetId: string): Blob {
        if (!IDENTIFIER.test(assetId)) {
            throw new Error("Invalid fixture asset ID");
        }
        return Bun.file(join(this.root, "assets", "contracts", releaseHash(canonicalJson), assetId));
    }

    async get(type: ArtifactType, publisherId: string, id: string, version: string): Promise<Buffer | null> {
        if (!IDENTIFIER.test(publisherId) || !IDENTIFIER.test(id) || !VERSION.test(version)) {
            return null;
        }
        return readFile(this.path(type, publisherId, id, version)).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
    }

    async list(type: ArtifactType): Promise<StoredArtifact[]> {
        const artifacts: StoredArtifact[] = [];
        for (const publisherId of await directories(join(this.root, type))) {
            for (const id of await directories(join(this.root, type, publisherId))) {
                const folder = join(this.root, type, publisherId, id);
                for (const file of await readdir(folder, { withFileTypes: true })) {
                    if (!file.isFile() || !file.name.endsWith(".json")) {
                        continue;
                    }
                    const version = file.name.slice(0, -5);
                    const bytes = await this.get(type, publisherId, id, version);
                    if (!bytes) {
                        throw new Error(`Invalid local ${type} coordinate: ${publisherId}/${id}/${version}`);
                    }
                    const publishedAt = (await stat(this.path(type, publisherId, id, version))).mtime.toISOString();
                    artifacts.push({ publisherId, id, version, bytes, publishedAt });
                }
            }
        }
        return artifacts;
    }

    private path(type: ArtifactType, publisherId: string, id: string, version: string): string {
        return join(this.root, type, publisherId, id, `${version}.json`);
    }
}

async function writeImmutable(path: string, bytes: Uint8Array | Blob): Promise<void> {
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    const snapshot = bytes instanceof Blob ? bytes : new Blob([bytes.slice()]);
    await durableWriteFile(temporary, new Uint8Array(await snapshot.arrayBuffer()), { flag: "wx", mode: 0o600 });
    try {
        await link(temporary, path);
        await syncDirectory(dirname(path));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const winner = Bun.file(path);
        if (winner.size !== snapshot.size || !(await sameBlobBytes(winner, snapshot))) {
            throw new Error(`Immutable artifact file already has different content: ${path}`);
        }
    } finally {
        await rm(temporary, { force: true });
    }
}

async function sameBlobBytes(left: Blob, right: Blob): Promise<boolean> {
    const [leftDigest, rightDigest] = await Promise.all(
        [left, right].map(async (value) => {
            const digest = await crypto.subtle.digest("SHA-256", await value.arrayBuffer());
            return Buffer.from(digest).toString("hex");
        }),
    );
    return leftDigest === rightDigest;
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function releaseHash(canonicalJson: string): string {
    return createHash("sha256").update(canonicalJson).digest("hex");
}

function sameBytes(existing: Buffer, candidate: string, type: ArtifactType, id: string, version: string): false {
    if (existing.toString("utf8") !== candidate) {
        throw new Error(`${type} ${id}@${version} already exists with different content`);
    }
    return false;
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
