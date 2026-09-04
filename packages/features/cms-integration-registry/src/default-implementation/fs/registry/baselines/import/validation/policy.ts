import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { ReviewedSchemaBaselineImportApproval } from "../../../../../../interfaces/publication";
import type { ReviewedSchemaBaselineImportTarget } from "../types";
import { assertBaselineImportApproval } from "./approval";

export async function identifyReviewedSchemaBaselineImportPolicy(
    approval: ReviewedSchemaBaselineImportApproval,
    targets: readonly ReviewedSchemaBaselineImportTarget[],
): Promise<string> {
    assertBaselineImportApproval(approval);
    const identities = new Set<string>();
    const normalized = [...targets].sort(compareTargets);
    for (const target of normalized) {
        const identity = targetIdentity(target);
        if (!isTarget(target) || identities.has(identity)) {
            throw new TypeError("Reviewed schema baseline import targets are invalid or duplicate");
        }
        identities.add(identity);
    }
    if (normalized.length === 0) {
        throw new TypeError("Reviewed schema baseline import requires at least one approved target");
    }
    return await sha256Hex(canonicalJsonBytes({ approval, targets: normalized }));
}

function isTarget(value: ReviewedSchemaBaselineImportTarget): boolean {
    return (
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.kind) &&
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value.version) &&
        /^[a-f0-9]{64}$/u.test(value.packageDigest) &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.connectorKey) &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.lineageId)
    );
}

function targetIdentity(value: ReviewedSchemaBaselineImportTarget): string {
    return `${value.kind}\0${value.version}\0${value.packageDigest}\0${value.connectorKey}\0${value.lineageId}`;
}

function compareTargets(left: ReviewedSchemaBaselineImportTarget, right: ReviewedSchemaBaselineImportTarget): number {
    const leftIdentity = targetIdentity(left);
    const rightIdentity = targetIdentity(right);
    return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
}
