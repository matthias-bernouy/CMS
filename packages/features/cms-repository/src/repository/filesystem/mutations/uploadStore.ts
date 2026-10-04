import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
    PublicationEnvelope,
    PublicationUploadManifest,
    PublicationUploadReceipt,
    RepositoryPublicationResult,
    RepositoryPublicationUploadStore,
} from "cms-repository/repository/publication/types";
import { digestUploadFile, readUploadResult, writeUploadResult, writeUploadStream } from "./uploadFiles";

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

    constructor(root: string) {
        this.uploadRoot = join(root, ".publication-uploads");
    }

    async create(manifest: PublicationUploadManifest, expiresAt: Date): Promise<PublicationUploadReceipt> {
        await mkdir(this.uploadRoot, { recursive: true, mode: 0o700 });
        await this.pruneExpired();
        const uploadId = randomUUID();
        const directory = this.directory(uploadId);
        await mkdir(join(directory, "assets"), { recursive: true, mode: 0o700 });
        const document: UploadDocument = {
            schema: SCHEMA,
            uploadId,
            expiresAt: expiresAt.toISOString(),
            manifest,
        };
        try {
            await writeFile(join(directory, "upload.json"), JSON.stringify(document), { flag: "wx", mode: 0o600 });
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
            await writeUploadResult(join(this.directory(uploadId), "result.json"), result);
            await rm(join(this.directory(uploadId), "assets"), { recursive: true, force: true });
            return result;
        } finally {
            await lock.close();
            await rm(join(this.directory(uploadId), ".commit-lock"), { force: true });
        }
    }

    async abort(uploadId: string): Promise<void> {
        if (await this.readResult(uploadId)) {
            return;
        }
        const lock = await this.acquireCommitLock(uploadId);
        await lock.close();
        await rm(this.directory(uploadId), { recursive: true, force: true });
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
        return open(join(this.directory(uploadId), ".commit-lock"), "wx", 0o600).catch(
            (error: NodeJS.ErrnoException) => {
                if (error.code === "EEXIST") {
                    throw new Error("Publication upload commit already in progress");
                }
                throw error;
            },
        );
    }

    private async pruneExpired(): Promise<void> {
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
                await rm(this.directory(entry.name), { recursive: true, force: true });
            }
        }
    }

    private directory(uploadId: string): string {
        if (!UPLOAD_ID.test(uploadId)) {
            throw new Error("Invalid publication upload ID");
        }
        return join(this.uploadRoot, uploadId);
    }
}
