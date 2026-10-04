import { matchesRepositoryToken, verifyRepositoryRequest } from "./auth";
import { parsePublication, parseYank, readRepositoryMutationBody } from "./protocol";
import type {
    RemoteCoordinate,
    RepositoryArtifactKind,
    RepositoryPublicationRegistry,
    RepositoryReplayStore,
} from "./types";

const SIGNATURE_TTL_MS = 5 * 60 * 1_000;

/** Authenticated HTTP mutation transport; storage and atomicity belong to the supplied registry. */
export class RepositoryMutationEndpoint {
    constructor(
        private readonly registry: RepositoryPublicationRegistry,
        private readonly token?: string,
        private readonly replays: RepositoryReplayStore = new InMemoryRepositoryReplayStore(),
    ) {}

    async handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        if (url.search) {
            return null;
        }
        if (request.method === "POST" && url.pathname === "/v1/publications") {
            return this.authorized(request, async (bytes) => this.registry.publish(parsePublication(bytes)));
        }
        if (request.method === "PUT" && url.pathname.startsWith("/v1/yanks/")) {
            return this.authorized(request, async (bytes) =>
                this.registry.setYank(parseYankCoordinate(url.pathname), parseYank(bytes)),
            );
        }
        return null;
    }

    private async authorized(request: Request, mutation: (bytes: Uint8Array) => Promise<unknown>): Promise<Response> {
        if (!this.token) {
            return response(405, "repository_read_only", "Repository mutations are disabled");
        }
        if (!matchesRepositoryToken(request, this.token)) {
            return response(401, "invalid_signature", "Repository request authentication failed");
        }
        let bytes: Uint8Array;
        try {
            bytes = await readRepositoryMutationBody(request);
        } catch (error) {
            return response(413, "request_too_large", errorMessage(error));
        }
        const signature = verifyRepositoryRequest(request, bytes, this.token);
        if (!signature || !(await this.replays.claim(signature, new Date(Date.now() + SIGNATURE_TTL_MS)))) {
            return response(401, "invalid_signature", "Repository request authentication failed");
        }
        try {
            return Response.json(await mutation(bytes), { status: 200 });
        } catch (error) {
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

function parseYankCoordinate(path: string): RemoteCoordinate {
    const parts = path.split("/");
    if (parts.length !== 7) {
        throw new Error("Invalid yank coordinate");
    }
    const [kind, publisherId, id, version] = parts.slice(3).map(decodeURIComponent);
    if (!isKind(kind)) {
        throw new Error("Invalid yank artifact kind");
    }
    return { kind, publisherId: publisherId!, id: id!, version: version! };
}

function isKind(value: string | undefined): value is RepositoryArtifactKind {
    return value === "collection" || value === "contract" || value === "provider-manifest";
}

function response(status: number, code: string, message: string): Response {
    return Response.json({ error: { code, message } }, { status });
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Repository mutation failed";
}
