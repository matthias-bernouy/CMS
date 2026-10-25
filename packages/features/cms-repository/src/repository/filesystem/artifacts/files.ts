import { RepositoryRequestError } from "../../core/errors";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stat } from "node:fs/promises";
import { ensureDurableDirectory } from "../core/durable";
import { listDirectories, writeImmutableFile } from "../core/immutableFiles";
import { isRepositoryIdentifier } from "cms-repository/exports/contracts/compatibility";

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
                if (!ASSET_IDENTIFIER.test(fixture.id)) {
                    throw new Error("Invalid fixture asset ID");
                }
                const path = join(fixtureRoot, fixture.id);
                await writeImmutableFile(
                    path,
                    fixture.bytes,
                    `Immutable artifact file already has different content: ${path}`,
                );
            }
        }
        await writeImmutableFile(
            path,
            Buffer.from(canonicalJson),
            `Immutable artifact file already has different content: ${path}`,
        );
        return true;
    }

    async fixture(canonicalJson: string, assetId: string): Promise<Buffer> {
        if (!ASSET_IDENTIFIER.test(assetId)) {
            throw new Error("Invalid fixture asset ID");
        }
        return readFile(join(this.root, "assets", "contracts", releaseHash(canonicalJson), assetId));
    }

    fixtureBlob(canonicalJson: string, assetId: string): Bun.BunFile {
        if (!ASSET_IDENTIFIER.test(assetId)) {
            throw new Error("Invalid fixture asset ID");
        }
        return Bun.file(join(this.root, "assets", "contracts", releaseHash(canonicalJson), assetId));
    }

    async get(type: ArtifactType, publisherId: string, id: string, version: string): Promise<Buffer | null> {
        if (!isRepositoryIdentifier(publisherId) || !isRepositoryIdentifier(id) || !VERSION.test(version)) {
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
        for (const publisherId of await listDirectories(join(this.root, type))) {
            for (const id of await listDirectories(join(this.root, type, publisherId))) {
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

    async storeEvidence(providerId: string, contractId: string, evidenceId: string, canonicalJson: string) {
        const path = this.evidencePath(providerId, contractId, evidenceId);
        const existing = await this.getEvidence(providerId, contractId, evidenceId);
        if (existing) {
            return sameBytes(existing, canonicalJson, "conformance evidence", evidenceId, "immutable");
        }
        await ensureDurableDirectory(dirname(path), this.root);
        await writeImmutableFile(
            path,
            Buffer.from(canonicalJson),
            `Immutable artifact file already has different content: ${path}`,
        );
        return true;
    }

    async getEvidence(providerId: string, contractId: string, evidenceId: string): Promise<Buffer | null> {
        if (!isRepositoryIdentifier(providerId) || !isRepositoryIdentifier(contractId) || !UUID.test(evidenceId)) {
            return null;
        }
        return readFile(this.evidencePath(providerId, contractId, evidenceId)).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
    }

    private path(type: ArtifactType, publisherId: string, id: string, version: string): string {
        return join(this.root, type, publisherId, id, `${version}.json`);
    }

    private evidencePath(providerId: string, contractId: string, evidenceId: string): string {
        return join(this.root, "conformance-evidence", providerId, contractId, `${evidenceId}.json`);
    }
}

const ASSET_IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function releaseHash(canonicalJson: string): string {
    return createHash("sha256").update(canonicalJson).digest("hex");
}

function sameBytes(existing: Buffer, candidate: string, type: string, id: string, version: string): false {
    if (existing.toString("utf8") !== candidate) {
        throw new RepositoryRequestError("REJECTED", `${type} ${id}@${version} already exists with different content`);
    }
    return false;
}
