import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { COLLECTION_PUBLICATION_ISSUES } from "repository/collections/core/errors";
import type { CollectionPublicationCode, CollectionPublicationResource } from "repository/collections/core/errors";
import { RepositoryRequestError } from "../../core/errors";
import { RepositoryHttpError } from "repository/repository-http/errors";

const REMOTE_CODES = new Set([
    "REJECTED",
    "NOT_FOUND",
    "ACTOR_UNAVAILABLE",
    "CORE_UNAVAILABLE",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "INVALID_INPUT",
]);

/** Remote text is not a trusted diagnostic: reconstruct only known codes and bounded identities. */
export function publicationResponseError(response: Response, body?: Uint8Array, phase?: string): Error {
    if (response.status < 400 || response.status >= 500) {
        const error = new RepositoryHttpError(response.status);
        if (phase) {
            error.message = `Repository ${phase} failed (HTTP ${response.status}).`;
        }
        return error;
    }
    let error: { code?: unknown; output?: { publicationCode?: unknown; publicationResource?: unknown } } | undefined;
    try {
        error = body ? (parseStrictJson(body, 4096, 8) as { error?: typeof error })?.error : undefined;
    } catch {
        // Malformed diagnostics must not hide the original HTTP refusal.
    }
    const remoteCode = typeof error?.code === "string" && REMOTE_CODES.has(error.code) ? error.code : undefined;
    const candidateId = response.headers.get("x-ulvia-request-id");
    const requestId = candidateId && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(candidateId) ? candidateId : undefined;
    const facts = {
        status: response.status,
        ...(phase ? { phase } : {}),
        ...(remoteCode ? { remoteCode } : {}),
        ...(requestId ? { requestId } : {}),
    };
    const context = `HTTP ${response.status}${remoteCode ? `, ${remoteCode}` : ""}${requestId ? `; request ID ${requestId}` : ""}`;
    const code = error?.output?.publicationCode;
    if (
        response.status === 409 &&
        remoteCode === "REJECTED" &&
        typeof code === "string" &&
        Object.hasOwn(COLLECTION_PUBLICATION_ISSUES, code)
    ) {
        const publicationCode = code as CollectionPublicationCode;
        const candidate = error?.output?.publicationResource as CollectionPublicationResource | undefined;
        const resource =
            candidate &&
            ["bloc", "theme-token", "configuration", "text", "asset", "state"].includes(candidate.kind) &&
            typeof candidate.id === "string" &&
            /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,511}$/u.test(candidate.id)
                ? { kind: candidate.kind, id: candidate.id }
                : undefined;
        return new RepositoryRequestError(
            "REJECTED",
            `Repository ${phase ?? "publication"} refused (${context}): ${resource ? `${resource.kind} ${resource.id}: ` : ""}${COLLECTION_PUBLICATION_ISSUES[publicationCode]}`,
            publicationCode,
            resource,
            facts,
        );
    }
    return new RepositoryRequestError(
        "REJECTED",
        `Repository ${phase ?? "request"} failed (${context}). The server returned no recognized publication reason.`,
        undefined,
        undefined,
        facts,
    );
}

export function publicationPhase(path: string): string | undefined {
    if (path === "v1/uploads") {
        return "upload preparation";
    }
    if (path === "v1/uploads/commit" || path === "v1/artifacts/commit") {
        return "publication commit";
    }
    if (path === "v1/uploads/build" || path === "v1/uploads/build-status") {
        return "source build";
    }
    return undefined;
}
