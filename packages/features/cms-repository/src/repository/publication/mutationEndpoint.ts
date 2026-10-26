import { createHash } from "node:crypto";
import {
    MAX_PUBLICATION_METADATA_BYTES,
    parsePublicationUpload,
    parseYank,
    parseYankRevision,
    readRepositoryMutationBody,
} from "./protocol";
import { parsePublicationUploadPath, parseYankCoordinate } from "./routes";
import type { RepositoryPublicationRegistry, RepositoryPublicationUploadStore, RepositoryReplayStore } from "./types";
import type { RepositoryNamespaceAuthority } from "../namespaces/authority";
import { assertPublicationOwner, manifestPublisher, ownerProofFromRequest } from "../namespaces/publication";

const SIGNATURE_TTL_MS = 5 * 60 * 1_000;
const UPLOAD_TTL_MS = 60 * 60 * 1_000;

export type RepositoryMutationOptions = Readonly<{
    uploads?: RepositoryPublicationUploadStore;
    replays?: RepositoryReplayStore;
    namespaces?: RepositoryNamespaceAuthority;
}>;

/** Authenticated mutation transport. Publication bytes are staged before one atomic registry commit. */
export class RepositoryMutationEndpoint {
    private readonly uploads?: RepositoryPublicationUploadStore;
    private readonly replays: RepositoryReplayStore;
    private readonly namespaces?: RepositoryNamespaceAuthority;

    constructor(
        private readonly registry: RepositoryPublicationRegistry,
        options: RepositoryMutationOptions = {},
    ) {
        this.uploads = options.uploads;
        this.replays = options.replays ?? new InMemoryRepositoryReplayStore();
        this.namespaces = options.namespaces;
        if (this.namespaces && !this.uploads) {
            throw new Error("Writable repository mutations require a publication upload store");
        }
    }

    async handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        if (url.search) {
            return null;
        }
        if (request.method === "GET" && url.pathname.startsWith("/v1/yanks/") && this.registry.getPublicationState) {
            try {
                return Response.json(await this.registry.getPublicationState(parseYankCoordinate(url.pathname)), {
                    headers: { "Cache-Control": "no-store" },
                });
            } catch {
                return response(404, "not_found", "Publication metadata is unavailable");
            }
        }
        if (request.method === "POST" && url.pathname === "/v1/publication-uploads") {
            return this.withBytes(request, MAX_PUBLICATION_METADATA_BYTES, async (bytes) => {
                const manifest = parsePublicationUpload(bytes);
                if (this.namespaces) {
                    await assertPublicationOwner(request, manifestPublisher(manifest));
                }
                return this.uploads!.create(manifest, new Date(Date.now() + UPLOAD_TTL_MS));
            });
        }
        const upload = parsePublicationUploadPath(url.pathname);
        if (upload && !upload.assetId && request.method === "GET") {
            return this.authorizedUpload(request, upload.uploadId, () => this.uploads!.status(upload.uploadId));
        }
        if (upload?.assetId && request.method === "PUT") {
            return this.putAsset(request, upload.uploadId, upload.assetId);
        }
        if (upload && !upload.assetId && request.method === "POST") {
            return this.authorizedUpload(request, upload.uploadId, async () =>
                this.uploads!.commit(upload.uploadId, (envelope) => this.registry.publish(envelope)),
            );
        }
        if (upload && !upload.assetId && request.method === "DELETE") {
            return this.authorizedUpload(request, upload.uploadId, async () => {
                await this.uploads!.abort(upload.uploadId);
                return null;
            });
        }
        if (request.method === "PUT" && url.pathname.startsWith("/v1/yanks/")) {
            return this.withBytes(request, 2_048, async (bytes) => {
                const coordinate = parseYankCoordinate(url.pathname);
                await assertPublicationOwner(request, coordinate.publisherId);
                const revision = parseYankRevision(bytes);
                if (revision === undefined) {
                    throw new Error("Owner publication metadata writes require an expected revision");
                }
                return this.registry.setYank(coordinate, parseYank(bytes), revision);
            });
        }
        return null;
    }

    private async putAsset(request: Request, uploadId: string, assetId: string): Promise<Response> {
        return this.authorizedUpload(request, uploadId, async (verified) => {
            const declared = request.headers.get("content-length");
            const contentLength = declared === null ? undefined : Number(declared);
            if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) {
                throw new RepositoryMutationError(400, "invalid_content_length", "Invalid Content-Length header");
            }
            await this.uploads!.putAsset(uploadId, assetId, request.body, verified.contentDigest, contentLength);
            return null;
        });
    }

    private async authorizedUpload(
        request: Request,
        uploadId: string,
        operation: (verified: { contentDigest: `sha256:${string}` }) => Promise<unknown>,
    ): Promise<Response> {
        return this.authorized(request, async (verified) => {
            if (this.namespaces) {
                await assertPublicationOwner(request, manifestPublisher(await this.uploads!.describe(uploadId)));
            }
            return operation(verified);
        });
    }

    private async withBytes(
        request: Request,
        maximum: number,
        mutation: (bytes: Uint8Array) => Promise<unknown>,
    ): Promise<Response> {
        return this.authorized(request, async (verified) => {
            let bytes: Uint8Array;
            try {
                bytes = await readRepositoryMutationBody(request, maximum);
            } catch (error) {
                throw new RepositoryMutationError(413, "request_too_large", errorMessage(error));
            }
            const digest = sha256(bytes);
            if (verified.contentDigest !== digest) {
                throw new RepositoryMutationError(401, "invalid_signature", "Repository request authentication failed");
            }
            return mutation(bytes);
        });
    }

    private async authorized(
        request: Request,
        mutation: (verified: { contentDigest: `sha256:${string}` }) => Promise<unknown>,
    ): Promise<Response> {
        if (!this.namespaces) {
            return response(405, "repository_read_only", "Repository mutations are disabled");
        }
        try {
            const proof = ownerProofFromRequest(request);
            if (!proof) {
                return response(401, "invalid_signature", "Repository request authentication failed");
            }
            const verified = {
                replayKey: `sha256=${createHash("sha256").update(`ed25519:${proof.signature}`).digest("hex")}`,
                contentDigest: proof.digest as `sha256:${string}`,
            };
            const url = new URL(request.url);
            const execute = async () => {
                const signedAt = proof.timestamp;
                if (!(await this.replays.claim(verified.replayKey, new Date(signedAt + SIGNATURE_TTL_MS + 1)))) {
                    throw new RepositoryMutationError(
                        401,
                        "invalid_signature",
                        "Repository request authentication failed",
                    );
                }
                return mutation(verified);
            };
            const result = await this.namespaces.execute(
                proof.namespace,
                `http:${request.method}`,
                `${url.pathname}${url.search}`,
                proof.digest,
                proof,
                execute,
            );
            return result === null ? new Response(null, { status: 204 }) : Response.json(result, { status: 200 });
        } catch (error) {
            if (error instanceof RepositoryMutationError) {
                return response(error.status, error.code, error.message);
            }
            return response(409, "publication_rejected", errorMessage(error));
        }
    }
}

export class InMemoryRepositoryReplayStore implements RepositoryReplayStore {
    private readonly signatures = new Map<string, number>();

    async claim(signature: string, expiresAt: Date): Promise<boolean> {
        const now = Date.now();
        for (const [key, expiry] of this.signatures) {
            if (expiry <= now) {
                this.signatures.delete(key);
            }
        }
        if (this.signatures.has(signature)) {
            return false;
        }
        this.signatures.set(signature, expiresAt.getTime());
        return true;
    }
}

export class RepositoryMutationError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

function response(status: number, code: string, message: string): Response {
    return Response.json({ error: { code, message } }, { status });
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Repository mutation failed";
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
