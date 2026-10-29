import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import { requiredText } from "../support";

export type ReleaseReference = {
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
    approvedBrowserRiskDigest: string;
};

export function parseReference(value: unknown): ReleaseReference {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    const record = value as Record<string, unknown>;
    return {
        repositoryId: requiredText(record.repositoryId),
        publisherId: requiredText(record.publisherId),
        collectionId: requiredText(record.collectionId),
        version: requiredText(record.version),
        digest: requiredText(record.digest),
        approvedBrowserRiskDigest: requiredText(record.approvedBrowserRiskDigest),
    };
}

export function sameRelease(
    value: { publisherId: string; collectionId: string; version: string; digest: string },
    reference: Pick<ReleaseReference, "publisherId" | "collectionId" | "version" | "digest">,
): boolean {
    return (
        value.publisherId === reference.publisherId &&
        value.collectionId === reference.collectionId &&
        value.version === reference.version &&
        value.digest === reference.digest
    );
}
