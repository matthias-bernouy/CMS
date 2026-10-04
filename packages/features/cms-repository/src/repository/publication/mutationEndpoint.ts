import { verifyRepositoryRequestHeaders } from "./auth";
import { createHash } from "node:crypto";
import {
    MAX_PUBLICATION_METADATA_BYTES,
    parsePublicationUpload,
    parseYank,
    readRepositoryMutationBody,
} from "./protocol";
import { parsePublicationUploadPath, parseYankCoordinate } from "./routes";
import type { RepositoryPublicationRegistry, RepositoryPublicationUploadStore, RepositoryReplayStore } from "./types";

const SIGNATURE_TTL_MS = 5 * 60 * 1_000;
const UPLOAD_TTL_MS = 60 * 60 * 1_000;

export type RepositoryMutationOptions = Readonly<{
    token?: string;
    uploads?: RepositoryPublicationUploadStore;
    replays?: RepositoryReplayStore;
}>;

/** Authenticated mutation transport. Publication bytes are staged before one atomic registry commit. */
export class RepositoryMutationEndpoint {
    private readonly token?: string;
    private readonly uploads?: RepositoryPublicationUploadStore;
    private readonly replays: RepositoryReplayStore;

    constructor(
        private readonly registry: RepositoryPublicationRegistry,
        options: RepositoryMutationOptions = {},
    ) {
        this.token = options.token;
        this.uploads = options.uploads;
        this.replays = options.replays ?? new InMemoryRepositoryReplayStore();
        if (this.token && !this.uploads) {
            throw new Error("Writable repository mutations require a publication upload store");
        }
    }

    async handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        if (url.search) {
            return null;
        }
        if (request.method === "POST" && url.pathname === "/v1/publication-uploads") {
            return this.withBytes(request, MAX_PUBLICATION_METADATA_BYTES, async (bytes) => {
                const manifest = parsePublicationUpload(bytes);
                return this.uploads!.create(manifest, new Date(Date.now() + UPLOAD_TTL_MS));
            });
        }
        const upload = parsePublicationUploadPath(url.pathname);
        if (upload?.assetId && request.method === "PUT") {
            return this.putAsset(request, upload.uploadId, upload.assetId);
        }
        if (upload && !upload.assetId && request.method === "POST") {
            return this.authorized(request, async () =>
                this.uploads!.commit(upload.uploadId, (envelope) => this.registry.publish(envelope)),
            );
        }
        if (upload && !upload.assetId && request.method === "DELETE") {
            return this.authorized(request, async () => {
                await this.uploads!.abort(upload.uploadId);
                return null;
            });
        }
        if (request.method === "PUT" && url.pathname.startsWith("/v1/yanks/")) {
            return this.withBytes(request, 2_048, async (bytes) =>
                this.registry.setYank(parseYankCoordinate(url.pathname), parseYank(bytes)),
            );
        }
        return null;
    }

    private async putAsset(request: Request, uploadId: string, assetId: string): Promise<Response> {
        return this.authorized(request, async (verified) => {
            const declared = request.headers.get("content-length");
            const contentLength = declared === null ? undefined : Number(declared);
            if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) {
                throw new RepositoryMutationError(400, "invalid_content_length", "Invalid Content-Length header");
            }
            await this.uploads!.putAsset(uploadId, assetId, request.body, verified.contentDigest, contentLength);
            return null;
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
        if (!this.token) {
            return response(405, "repository_read_only", "Repository mutations are disabled");
        }
        const verified = verifyRepositoryRequestHeaders(request, this.token);
        if (!verified || !(await this.replays.claim(verified.replayKey, new Date(Date.now() + SIGNATURE_TTL_MS)))) {
            return response(401, "invalid_signature", "Repository request authentication failed");
        }
        try {
            const result = await mutation(verified);
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
