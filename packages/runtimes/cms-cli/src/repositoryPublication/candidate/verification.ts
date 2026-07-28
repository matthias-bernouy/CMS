import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { DEFAULT_CANONICAL_FILE_SET_LIMITS, type IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import { readBoundedRegularFile } from "@bernouy/cms-integration-packages/fs";
import {
    IntegrationVerificationContractError,
    parseIntegrationVerificationEnvelope,
    validateIntegrationVerificationSuiteSources,
    type IntegrationVerificationEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import { IntegrationCandidateBuildError } from "./errors";

const PLATFORM_RUNNER_REQUIREMENT = Object.freeze({
    name: "cms-postgres",
    versionRange: "^1.0.0",
});

const VERIFICATION_DOCUMENT_LIMITS: Readonly<IntegrationPackageLimits> = Object.freeze({
    ...DEFAULT_CANONICAL_FILE_SET_LIMITS,
    maxFileBytes: DEFAULT_CANONICAL_FILE_SET_LIMITS.maxDocumentBytes,
    maxDecodedBytes: DEFAULT_CANONICAL_FILE_SET_LIMITS.maxDocumentBytes,
});

export async function loadIntegrationVerificationBundle(
    root: string,
    expected: Readonly<{ kind: string; version: string; packageDigest: string }>,
): Promise<IntegrationVerificationEnvelopeV1> {
    const relativePath = verificationBundleRelativePath(expected.version);
    let bytes: Uint8Array;
    try {
        const path = await resolveVerificationPath(root, relativePath);
        bytes = await readBoundedRegularFile(path, 0, VERIFICATION_DOCUMENT_LIMITS);
    } catch {
        throw new IntegrationCandidateBuildError(
            "verification_missing",
            `Verification bundle ${relativePath} must be a bounded, non-symlink regular file`,
        );
    }

    let envelope: IntegrationVerificationEnvelopeV1;
    try {
        envelope = parseIntegrationVerificationEnvelope(bytes);
        envelope = await validateIntegrationVerificationSuiteSources(envelope);
    } catch (error) {
        if (error instanceof IntegrationCandidateBuildError) {
            throw error;
        }
        const reason = error instanceof IntegrationVerificationContractError ? ` (${error.code})` : "";
        throw new IntegrationCandidateBuildError(
            "verification_invalid",
            `Verification bundle ${relativePath} is invalid${reason}; check its schema, manifest references, and files`,
        );
    }

    if (
        envelope.target.kind !== expected.kind ||
        envelope.target.version !== expected.version ||
        envelope.target.packageDigest !== expected.packageDigest
    ) {
        throw new IntegrationCandidateBuildError(
            "verification_invalid",
            `Verification bundle ${relativePath} must target version ${expected.version} with package-sha256:${expected.packageDigest}`,
        );
    }
    if (
        !envelope.manifest.runnerRequirements.some(
            (requirement) =>
                requirement.name === PLATFORM_RUNNER_REQUIREMENT.name &&
                requirement.versionRange === PLATFORM_RUNNER_REQUIREMENT.versionRange,
        )
    ) {
        throw new IntegrationCandidateBuildError(
            "verification_invalid",
            `Verification bundle ${relativePath} must require cms-postgres version range ^1.0.0`,
        );
    }
    if (envelope.manifest.contracts.length + envelope.manifest.conformance.length === 0) {
        throw new IntegrationCandidateBuildError(
            "verification_invalid",
            `Verification bundle ${relativePath} must declare at least one author contract or conformance suite`,
        );
    }
    return envelope;
}

async function resolveVerificationPath(root: string, source: string): Promise<string> {
    const canonicalRoot = await realpath(root);
    const requested = join(canonicalRoot, source);
    const canonicalFile = await realpath(requested);
    const relation = relative(canonicalRoot, canonicalFile);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error("Verification bundle escapes the selected integration root");
    }
    return requested;
}

export function verificationBundleRelativePath(version: string): string {
    return `verification/${version}.json`;
}
