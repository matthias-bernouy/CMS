import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { deepFreeze } from "../protocol/values";
import { compileContractBindings } from "../bindings/compileContractBindings";
import type { ContractRelease } from "../../interfaces/ContractRelease";
import { compareCapability } from "./compareCapability";
import { isSemVerPrerelease, semVerReleaseTarget, versionBump, type VersionBump } from "./semver";

export type CompatibilityIssueCode =
    | "binding_changed"
    | "capability_added"
    | "capability_changed"
    | "capability_removed"
    | "contract_id_changed"
    | "insufficient_version_bump"
    | "publisher_changed"
    | "schema_changed"
    | "version_not_increased";

export interface CompatibilityIssue {
    readonly capabilityId?: string;
    readonly code: CompatibilityIssueCode;
    readonly message: string;
    readonly path?: string;
    readonly requiredBump?: VersionBump;
}

export interface ContractCompatibilityReport {
    /** Identity, ownership and the declared version increase allow this evolution. */
    readonly validEvolution: boolean;
    /** Old consumers remain supported with release-specific output projection; this is not provider conformance. */
    readonly consumerCompatible: boolean;
    readonly declaredBump: VersionBump | null;
    readonly issues: readonly CompatibilityIssue[];
    readonly requiredBump: VersionBump;
}

const BUMP_RANK: Readonly<Record<VersionBump, number>> = { patch: 1, minor: 2, major: 3 };

export function compareContractReleases(
    previous: ContractRelease,
    next: ContractRelease,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): ContractCompatibilityReport {
    compileContractBindings(previous);
    compileContractBindings(next);
    const issues: CompatibilityIssue[] = [];
    let requiredBump: VersionBump = "patch";
    if (previous.contractId !== next.contractId) {
        issues.push({ code: "contract_id_changed", message: "contract IDs must match" });
    }
    if (previous.publisherId !== next.publisherId) {
        issues.push({ code: "publisher_changed", message: "publisher ownership cannot change between releases" });
    }
    const previousCapabilities = new Map(previous.capabilities.map((capability) => [capability.id, capability]));
    const nextCapabilities = new Map(next.capabilities.map((capability) => [capability.id, capability]));
    for (const [id, capability] of previousCapabilities) {
        const replacement = nextCapabilities.get(id);
        if (!replacement) {
            requiredBump = "major";
            issues.push({
                code: "capability_removed",
                capabilityId: id,
                message: `removed capability ${id}`,
                path: `capabilities[${JSON.stringify(id)}]`,
                requiredBump: "major",
            });
            continue;
        }
        for (const change of compareCapability(
            capability,
            replacement,
            `capabilities[${JSON.stringify(id)}]`,
            limits.maxJsonDepth,
        )) {
            requiredBump = maxBump(requiredBump, change.requiredBump);
            issues.push({
                code: change.code,
                capabilityId: id,
                path: change.path,
                message: `${change.message} at ${change.path}`,
                requiredBump: change.requiredBump,
            });
        }
    }
    for (const id of nextCapabilities.keys()) {
        if (!previousCapabilities.has(id)) {
            requiredBump = maxBump(requiredBump, "minor");
            issues.push({
                code: "capability_added",
                capabilityId: id,
                message: `added capability ${id}`,
                path: `capabilities[${JSON.stringify(id)}]`,
                requiredBump: "minor",
            });
        }
    }
    const declaredBump = versionBump(previous.version, next.version);
    // A target's previews may evolve before stabilization. Publication must
    // independently check the candidate against its latest stable major line.
    const previewEvolution =
        isSemVerPrerelease(previous.version) &&
        semVerReleaseTarget(previous.version) === semVerReleaseTarget(next.version);
    if (!declaredBump) {
        issues.push({ code: "version_not_increased", message: "next release version must increase" });
    } else if (!previewEvolution && BUMP_RANK[declaredBump] < BUMP_RANK[requiredBump]) {
        issues.push({
            code: "insufficient_version_bump",
            message: `${requiredBump} change declared with a ${declaredBump} version bump`,
        });
    }
    const invalidCodes = new Set<CompatibilityIssueCode>([
        "contract_id_changed",
        "insufficient_version_bump",
        "publisher_changed",
        "version_not_increased",
    ]);
    return deepFreeze({
        validEvolution: !issues.some((issue) => invalidCodes.has(issue.code)),
        consumerCompatible:
            requiredBump !== "major" &&
            previous.contractId === next.contractId &&
            previous.publisherId === next.publisherId,
        declaredBump,
        requiredBump,
        issues,
    }) as ContractCompatibilityReport;
}

function maxBump(left: VersionBump, right: VersionBump): VersionBump {
    return BUMP_RANK[left] >= BUMP_RANK[right] ? left : right;
}
