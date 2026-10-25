import { RepositoryRequestError } from "../core/errors";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type { NamespaceProof } from "../namespaces/interfaces";
import { parseNamespaceProof } from "../namespaces/proofs";
import type { PublicationUploadManifest } from "../publication/types";

export function ownerProofFromRequest(request: Request): NamespaceProof | null {
    const header = request.headers.get("x-ulvia-owner-proof");
    if (!header) {
        return null;
    }
    if (header.length > 5_464 || !/^[A-Za-z0-9_-]+$/u.test(header)) {
        throw new RepositoryRequestError("REJECTED", "Invalid namespace proof header");
    }
    return parseNamespaceProof(parseStrictJson(Buffer.from(header, "base64url"), 4_096, 4));
}

export function manifestPublisher(manifest: Pick<PublicationUploadManifest, "kind" | "canonicalJson">): string {
    const value = parseStrictJson(manifest.canonicalJson, 16 * 1024 * 1024, 64) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RepositoryRequestError("REJECTED", "Publication has no publisher namespace");
    }
    const publisher =
        manifest.kind === "provider-manifest"
            ? (value.provenance as Record<string, unknown> | undefined)?.publisherId
            : value.publisherId;
    if (typeof publisher !== "string") {
        throw new RepositoryRequestError("REJECTED", "Publication has no publisher namespace");
    }
    return publisher;
}

export async function assertPublicationOwner(request: Request, publisher: string): Promise<void> {
    const proof = ownerProofFromRequest(request);
    if (!proof) {
        throw new RepositoryRequestError("REJECTED", "Publication requires a namespace owner proof");
    }
    if (proof.namespace !== publisher) {
        throw new RepositoryRequestError("REJECTED", "Publication is outside the authorized namespace");
    }
}
