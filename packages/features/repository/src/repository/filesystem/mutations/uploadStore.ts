import { RepositoryRequestError } from "../../core/errors";
import { randomUUID } from "node:crypto";
import { link, lstat, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
    PublicationEnvelope,
    OwnedPublicationUploadManifest,
    PublicationUploadReceipt,
    RepositoryPublicationResult,
    RepositoryPublicationUploadStore,
} from "repository/repository/publication/types";
import {
    digestUploadFile,
    readUploadResult,
    writeUploadResult,
    writeUploadStream,
} from "repository/repository/filesystem/mutations/uploadFiles";
import { durableWriteFile, ensureDurableDirectory, syncDirectory } from "repository/repository/filesystem/core/durable";
import { acquireFilesystemLease, FilesystemLeaseBusyError } from "../core/lock";
import { assetFileName } from "../core/assetFiles";
import { uploadOwner } from "../../publication/ownership";

import {
    isPublicationUploadId,
    uploadManifestFingerprint,
    withUploadResume,
} from "repository/repository/filesystem/mutations/uploadResume";
import { UploadMaintenance } from "./uploadMaintenance";

const SCHEMA = "ulvia.repository-upload.v1";

type UploadDocument = Readonly<{
    schema: typeof SCHEMA;
    uploadId: string;
    expiresAt: string;
    manifest: OwnedPublicationUploadManifest;
}>;

/** Filesystem staging adapter: streamed bytes remain private until registry publication succeeds. */
export class FilesystemRepositoryPublicationUploadStore implements RepositoryPublicationUploadStore {
    private readonly uploadRoot: string;
    private readonly tombstoneRoot: string;
    private readonly maintenance: UploadMaintenance;

    constructor(private readonly root: string) {
        this.uploadRoot = join(root, ".publication-uploads");
        this.tombstoneRoot = join(root, ".publication-upload-tombstones");
        this.maintenance = new UploadMaintenance(root, (id) => this.pruneExpiredUpload(id));
    }

    async create(supplied: OwnedPublicationUploadManifest, expiresAt: Date): Promise<PublicationUploadReceipt> {
        const manifest = structuredClone(supplied);
        uploadOwner(manifest.owner);
        const expiry = expiresAt.toISOString();
        await this.recover();
        const fingerprint = uploadManifestFingerprint(manifest);
        return withUploadResume(this.root, fingerprint, async (candidate) => {
            const resumable = candidate ? await this.findOpenUpload(candidate, fingerprint) : null;
            if (resumable) {
                return resumable;
            }
            const uploadId = randomUUID();
            return this.maintenance.enroll(uploadId, async () => {
                const directory = this.directory(uploadId);
                await ensureDurableDirectory(join(directory, "assets"), this.root);
                const document: UploadDocument = {
                    schema: SCHEMA,
                    uploadId,
                    expiresAt: expiry,
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
                return { uploadId, expiresAt: document.expiresAt, uploadedAssetIds: [] };
            });
        });
    }

    async status(uploadId: string): Promise<PublicationUploadReceipt> {
        const document = await this.readOpen(uploadId);
        return {
            uploadId,
            expiresAt: document.expiresAt,
            uploadedAssetIds: await this.verifiedAssetIds(document),
        };
    }

    async describe(uploadId: string): Promise<OwnedPublicationUploadManifest> {
        return (await this.readDocument(uploadId)).manifest;
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
            throw new RepositoryRequestError("REJECTED", "Publication upload asset is not declared");
        }
        if (contentDigest !== asset.digest || (contentLength !== undefined && contentLength !== asset.byteLength)) {
            throw new RepositoryRequestError(
                "REJECTED",
                "Publication upload asset metadata does not match its declaration",
            );
        }
        const lock = await this.acquireCommitLock(uploadId);
        try {
            await this.readOpen(uploadId);
            const destination = join(this.directory(uploadId), "assets", assetFileName(assetId));
            const temporary = `${destination}.${randomUUID()}.tmp`;
            try {
                const actual = await writeUploadStream(temporary, body, asset.byteLength);
                if (actual.digest !== asset.digest || actual.byteLength !== asset.byteLength) {
                    throw new RepositoryRequestError(
                        "REJECTED",
                        "Publication upload asset bytes do not match their declaration",
                    );
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
                        throw new RepositoryRequestError(
                            "REJECTED",
                            "A staged publication asset already has different content",
                        );
                    }
                }
            } finally {
                await rm(temporary, { force: true });
            }
        } finally {
            await lock.release();
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
            const verified = await this.verifiedAssetIds(document);
            if (verified.length !== document.manifest.assets.length) {
                throw new RepositoryRequestError("REJECTED", "Publication upload is incomplete");
            }
            const assets = document.manifest.assets.map((asset) => ({
                id: asset.id,
                bytes: Bun.file(join(this.directory(uploadId), "assets", assetFileName(asset.id))),
            }));
            const result = await publish({
                kind: document.manifest.kind,
                canonicalJson: document.manifest.canonicalJson,
                ...(document.manifest.sourceJson === undefined ? {} : { sourceJson: document.manifest.sourceJson }),
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
            throw new RepositoryRequestError("REJECTED", "Publication upload has expired");
        }
        if (await this.readResult(uploadId)) {
            throw new RepositoryRequestError("REJECTED", "Publication upload is already committed");
        }
        return document;
    }

    private async findOpenUpload(uploadId: string, fingerprint: string): Promise<PublicationUploadReceipt | null> {
        const document = await this.readDocumentIfPresent(uploadId);
        if (
            document &&
            Date.parse(document.expiresAt) > Date.now() &&
            uploadManifestFingerprint(document.manifest) === fingerprint &&
            !(await this.hasResult(uploadId))
        ) {
            return this.status(uploadId);
        }
        return null;
    }

    private async verifiedAssetIds(document: UploadDocument): Promise<string[]> {
        const verified: string[] = [];
        for (const asset of document.manifest.assets) {
            const path = join(this.directory(document.uploadId), "assets", assetFileName(asset.id));
            const metadata = await stat(path).catch(() => null);
            if (!metadata?.isFile() || metadata.size !== asset.byteLength) {
                continue;
            }
            const actual = await digestUploadFile(path);
            if (actual.byteLength === asset.byteLength && actual.digest === asset.digest) {
                verified.push(asset.id);
            }
        }
        return verified;
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
        uploadOwner(value.manifest.owner);
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
        await this.maintenance.run();
    }

    close(): Promise<void> {
        return this.maintenance.close();
    }

    private async hasResult(uploadId: string): Promise<boolean> {
        try {
            await lstat(join(this.directory(uploadId), "result.json"));
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return false;
            }
            throw error;
        }
    }

    private async pruneExpiredUpload(uploadId: string): Promise<boolean> {
        const tombstonePath = join(this.tombstoneRoot, uploadId);
        await this.removeTombstone(tombstonePath);
        // Completed receipts leave the queue without loading their result or manifest JSON.
        if (await this.hasResult(uploadId)) {
            return false;
        }
        const document = await this.readDocumentIfPresent(uploadId);
        if (!document) {
            // Enrollment is durable before creation; the same queue lease excludes a live creator.
            await rm(this.directory(uploadId), { recursive: true, force: true });
            await this.removeTombstone(tombstonePath);
            await syncDirectory(this.uploadRoot);
            return false;
        }
        if (Date.parse(document.expiresAt) > Date.now()) {
            return true;
        }
        const lock = await this.acquirePruneLock(uploadId);
        if (!lock) {
            return true;
        }
        let tombstone: string | null = null;
        try {
            const current = await this.readDocumentIfPresent(uploadId);
            if (current && Date.parse(current.expiresAt) <= Date.now() && !(await this.hasResult(uploadId))) {
                tombstone = await this.moveToTombstone(uploadId);
            }
        } finally {
            await lock.release();
        }
        await this.removeTombstone(tombstone);
        return false;
    }

    private async acquirePruneLock(uploadId: string) {
        try {
            return await this.acquireCommitLock(uploadId);
        } catch (error) {
            if (error instanceof FilesystemLeaseBusyError || (error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }

    private async readDocumentIfPresent(uploadId: string): Promise<UploadDocument | null> {
        try {
            return await this.readDocument(uploadId);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }

    private directory(uploadId: string): string {
        if (!isPublicationUploadId(uploadId)) {
            throw new RepositoryRequestError("REJECTED", "Invalid publication upload ID");
        }
        return join(this.uploadRoot, uploadId);
    }

    private async moveToTombstone(uploadId: string): Promise<string> {
        await ensureDurableDirectory(this.tombstoneRoot, this.root);
        const tombstone = join(this.tombstoneRoot, uploadId);
        await rename(this.directory(uploadId), tombstone);
        await syncDirectory(this.uploadRoot);
        await syncDirectory(this.tombstoneRoot);
        return tombstone;
    }

    private async removeTombstone(path: string | null): Promise<void> {
        if (!path) {
            return;
        }
        const present = await lstat(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (present) {
            await rm(path, { recursive: true, force: true });
            await syncDirectory(this.tombstoneRoot);
        }
    }
}
