import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { PageExecutionActivation, PageExecutionConsumer, PageExecutionPlan } from "../interfaces/PageExecution";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function snapshotActivation(input: PageExecutionActivation): PageExecutionActivation {
    const consumer = snapshotConsumer(input.consumer);
    if (!Array.isArray(input.requirements) || input.requirements.length > 256) {
        throw new GatewayError("invalid_input", "page execution requirements are invalid");
    }
    const requirements = input.requirements.map((item) => {
        requireIdentifier(item.contractId, "contract");
        requireIdentifier(item.capabilityId, "capability");
        if (typeof item.versionRange !== "string" || !item.versionRange || item.versionRange.length > 256) {
            throw new GatewayError("invalid_input", "page requirement version range is invalid");
        }
        return { contractId: item.contractId, capabilityId: item.capabilityId, versionRange: item.versionRange };
    });
    requirements.sort(
        (left, right) =>
            left.contractId.localeCompare(right.contractId) ||
            left.capabilityId.localeCompare(right.capabilityId) ||
            left.versionRange.localeCompare(right.versionRange),
    );
    return Object.freeze({ consumer, requirements: Object.freeze(requirements) });
}

export function snapshotConsumer(value: PageExecutionConsumer): PageExecutionConsumer {
    if (!value || typeof value !== "object") {
        throw new GatewayError("invalid_input", "page execution consumer is required");
    }
    if (
        typeof value.siteId !== "string" ||
        !value.siteId ||
        value.siteId !== value.siteId.trim() ||
        value.siteId.length > 128
    ) {
        throw new GatewayError("invalid_input", "page execution consumer metadata is invalid");
    }
    requireIdentifier(value.pageId, "page");
    if (value.kind === "site") {
        if (!Number.isSafeInteger(value.pageRevision) || value.pageRevision < 1) {
            throw new GatewayError("invalid_input", "site Page execution revision is invalid");
        }
        return Object.freeze({
            kind: "site",
            siteId: value.siteId,
            pageId: value.pageId,
            pageRevision: value.pageRevision,
        });
    }
    for (const [name, field] of Object.entries({
        publisher: value.publisherId,
        collection: value.collectionId,
    })) {
        requireIdentifier(field, name);
    }
    if (
        value.kind !== "collection" ||
        typeof value.collectionVersion !== "string" ||
        !value.collectionVersion ||
        value.collectionVersion.length > 128 ||
        typeof value.collectionDigest !== "string" ||
        !DIGEST.test(value.collectionDigest) ||
        !Number.isSafeInteger(value.pageGeneration) ||
        value.pageGeneration < 1
    ) {
        throw new GatewayError("invalid_input", "page execution consumer metadata is invalid");
    }
    return Object.freeze({
        kind: "collection",
        siteId: value.siteId,
        publisherId: value.publisherId,
        collectionId: value.collectionId,
        collectionVersion: value.collectionVersion,
        collectionDigest: value.collectionDigest,
        pageId: value.pageId,
        pageGeneration: value.pageGeneration,
    });
}

export function requireExecutionIdentifier(value: unknown, name: string): asserts value is string {
    requireIdentifier(value, name);
}

export function sameSelection(
    left: { version: string; digest: string; installationId: string },
    right: typeof left,
): boolean {
    return (
        left.version === right.version && left.digest === right.digest && left.installationId === right.installationId
    );
}

export async function digestPlan(plan: PageExecutionPlan): Promise<`sha256:${string}`> {
    const bytes = new TextEncoder().encode(canonicalizeIJson(plan));
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function requireIdentifier(value: unknown, name: string): asserts value is string {
    if (typeof value !== "string" || value.length > 128 || !IDENTIFIER.test(value)) {
        throw new GatewayError("invalid_input", `${name} identifier is invalid`);
    }
}
