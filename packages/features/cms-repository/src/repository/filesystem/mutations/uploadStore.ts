import { randomUUID } from "node:crypto";
import { link, lstat, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
    PublicationEnvelope,
    PublicationUploadManifest,
    PublicationUploadReceipt,
    RepositoryPublicationResult,
    RepositoryPublicationUploadStore,
} from "cms-repository/repository/publication/types";
import { digestUploadFile, readUploadResult, writeUploadResult, writeUploadStream } from "./uploadFiles";
import { durableWriteFile, ensureDurableDirectory, syncDirectory } from "../core/durable";
import { acquireFilesystemLease } from "../core/lock";

const SCHEMA = "ulvia.repository-upload.v1";
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type UploadDocument = Readonly<{
    schema: typeof SCHEMA;
    uploadId: string;
    expiresAt: string;
    manifest: PublicationUploadManifest;
}>;

/** Filesystem staging adapter: streamed bytes remain private until registry publication succeeds. */
export class FilesystemRepositoryPublicationUploadStore implements RepositoryPublicationUploadStore {
    private readonly uploadRoot: string;
    private readonly tombstoneRoot: string;

    constructor(private readonly root: string) {
        this.uploadRoot = join(root, ".publication-uploads");
        this.tombstoneRoot = join(root, ".publication-upload-tombstones");
    }

    async create(manifest: PublicationUploadManifest, expiresAt: Date): Promise<PublicationUploadReceipt> {
        await ensureDurableDirectory(this.uploadRoot, this.root);
        await this.pruneExpired();
        const uploadId = randomUUID();
        const directory = this.directory(uploadId);
        await ensureDurableDirectory(join(directory, "assets"), this.root);
        const document: UploadDocument = {
            schema: SCHEMA,
            uploadId,
            expiresAt: expiresAt.toISOString(),
            manifest,
        };
        try {
            await durableWriteFile(join(directory, "upload.json"), JSON.stringify(document), {
                flag: "wx",
                mode: 0o600,
            });
            await syncDirectory(directory);
        } catch (error) {
            await rm(directory, { recursive: true, force: true });
            throw error;
        }
        return { uploadId, expiresAt: document.expiresAt };
    }

    async putAsset(
        uploadId: string,
        assetId: string,
        body: ReadableStream<Uint8Array> | null,
        contentDigest: `sha256:${string}`,
        contentLength?: number,
    ): Promise<void> {
        const document = await this.readOpen(uploadId);
        const asset = document.manifest.assets.find((candidate) => candidate.id === assetId);
        if (!asset) {
            throw new Error("Publication upload asset is not declared");
        }
        if (contentDigest !== asset.digest || (contentLength !== undefined && contentLength !== asset.byteLength)) {
            throw new Error("Publication upload asset metadata does not match its declaration");
        }
        const destination = join(this.directory(uploadId), "assets", assetId);
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
            const actual = await writeUploadStream(temporary, body, asset.byteLength);
            if (actual.digest !== asset.digest || actual.byteLength !== asset.byteLength) {
                throw new Error("Publication upload asset bytes do not match their declaration");
            }
            try {
                await link(temporary, destination);
                await syncDirectory(join(this.directory(uploadId), "assets"));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw error;
                }
                const existing = await digestUploadFile(destination);
                if (existing.digest !== asset.digest || existing.byteLength !== asset.byteLength) {
                    throw new Error("A staged publication asset already has different content");
                }
            }
        } finally {
            await rm(temporary, { force: true });
        }
    }

    async commit(
        uploadId: string,
        publish: (envelope: PublicationEnvelope) => Promise<RepositoryPublicationResult>,
    ): Promise<RepositoryPublicationResult> {
        const existing = await this.readResult(uploadId);
        if (existing) {
            return existing;
        }
        const lock = await this.acquireCommitLock(uploadId);
        try {
            const winner = await this.readResult(uploadId);
            if (winner) {
                return winner;
            }
            const document = await this.readOpen(uploadId);
            const assets = await Promise.all(
                document.manifest.assets.map(async (asset) => {
                    const path = join(this.directory(uploadId), "assets", asset.id);
                    const metadata = await stat(path).catch(() => null);
                    if (!metadata?.isFile() || metadata.size !== asset.byteLength) {
                        throw new Error(`Publication upload asset ${asset.id} is incomplete`);
                    }
                    return { id: asset.id, bytes: Bun.file(path) };
                }),
            );
            const result = await publish({
                kind: document.manifest.kind,
                canonicalJson: document.manifest.canonicalJson,
                assets,
            });
            await lock.assertOwnership();
            await writeUploadResult(join(this.directory(uploadId), "result.json"), result);
            await rm(join(this.directory(uploadId), "assets"), { recursive: true, force: true });
            await syncDirectory(this.directory(uploadId));
            return result;
        } finally {
            await lock.release();
        }
    }

    async abort(uploadId: string): Promise<void> {
        if (await this.readResult(uploadId)) {
            return;
        }
        const lock = await this.acquireCommitLock(uploadId);
        let tombstone: string | null = null;
        try {
            if (await this.readResult(uploadId)) {
                return;
            }
            tombstone = await this.moveToTombstone(uploadId);
        } finally {
            await lock.release();
        }
        await this.removeTombstone(tombstone);
    }

    private async readOpen(uploadId: string): Promise<UploadDocument> {
        const document = await this.readDocument(uploadId);
        if (Date.parse(document.expiresAt) <= Date.now()) {
            throw new Error("Publication upload has expired");
        }
        if (await this.readResult(uploadId)) {
            throw new Error("Publication upload is already committed");
        }
        return document;
    }

    private async readDocument(uploadId: string): Promise<UploadDocument> {
        const value = JSON.parse(
            await readFile(join(this.directory(uploadId), "upload.json"), "utf8"),
        ) as UploadDocument;
        if (
            value.schema !== SCHEMA ||
            value.uploadId !== uploadId ||
            !Number.isFinite(Date.parse(value.expiresAt)) ||
            !value.manifest
        ) {
            throw new Error("Invalid publication upload metadata");
        }
        return value;
    }

    private async readResult(uploadId: string): Promise<RepositoryPublicationResult | null> {
        return readUploadResult(join(this.directory(uploadId), "result.json"));
    }

    private async acquireCommitLock(uploadId: string) {
        await this.readDocument(uploadId);
        return acquireFilesystemLease(join(this.directory(uploadId), ".commit-lock"), { createParent: false });
    }

    async recover(): Promise<void> {
        await ensureDurableDirectory(this.uploadRoot, this.root);
        await ensureDurableDirectory(this.tombstoneRoot, this.root);
        await this.removeAbandonedTombstones();
        await this.pruneExpired();
    }

    private async pruneExpired(): Promise<void> {
        let changed = false;
        for (const entry of await readdir(this.uploadRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || !UPLOAD_ID.test(entry.name)) {
                continue;
            }
            const metadata = await lstat(join(this.uploadRoot, entry.name));
            if (metadata.isSymbolicLink()) {
                continue;
            }
            const document = await this.readDocument(entry.name).catch(() => null);
            if (document && Date.parse(document.expiresAt) <= Date.now()) {
                const lock = await this.acquireCommitLock(entry.name).catch(() => null);
                if (!lock) {
                    continue;
                }
                let tombstone: string | null = null;
                try {
                    const current = await this.readDocument(entry.name).catch(() => null);
                    if (
                        current &&
                        Date.parse(current.expiresAt) <= Date.now() &&
                        !(await this.readResult(entry.name))
                    ) {
                        tombstone = await this.moveToTombstone(entry.name);
                        changed = true;
                    }
                } finally {
                    await lock.release();
                }
                await this.removeTombstone(tombstone);
            }
        }
        if (changed) {
            await syncDirectory(this.uploadRoot);
        }
    }

    private directory(uploadId: string): string {
        if (!UPLOAD_ID.test(uploadId)) {
            throw new Error("Invalid publication upload ID");
        }
        return join(this.uploadRoot, uploadId);
    }

    private async moveToTombstone(uploadId: string): Promise<string> {
        await ensureDurableDirectory(this.tombstoneRoot, this.root);
        const tombstone = join(this.tombstoneRoot, `${uploadId}.${randomUUID()}`);
        await rename(this.directory(uploadId), tombstone);
        await syncDirectory(this.uploadRoot);
        await syncDirectory(this.tombstoneRoot);
        return tombstone;
    }

    private async removeTombstone(path: string | null): Promise<void> {
        if (!path) {
            return;
        }
        await rm(path, { recursive: true, force: true });
        await syncDirectory(this.tombstoneRoot);
    }

    private async removeAbandonedTombstones(): Promise<void> {
        const entries = await readdir(this.tombstoneRoot, { withFileTypes: true });
        await Promise.all(
            entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => rm(join(this.tombstoneRoot, entry.name), { recursive: true, force: true })),
        );
        if (entries.some((entry) => entry.isDirectory())) {
            await syncDirectory(this.tombstoneRoot);
        }
    }
}
