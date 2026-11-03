import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { RepositoryRequestError } from "../core/errors";
import { assertRepositoryNamespace } from "../namespaces/validation";
import { namespaceAccountId, namespaceRevision } from "../namespaces/accounts/validation";
import type { PublicationUploadManifest, RepositoryUploadOwner } from "./types";

export function uploadOwner(value: unknown): RepositoryUploadOwner {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "accountId,namespace,namespaceRevision"
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid upload ownership binding");
    }
    const owner = value as RepositoryUploadOwner;
    namespaceAccountId(owner.accountId);
    assertRepositoryNamespace(owner.namespace);
    namespaceRevision(owner.namespaceRevision);
    return Object.freeze({ ...owner });
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
    assertRepositoryNamespace(publisher);
    return publisher;
}
