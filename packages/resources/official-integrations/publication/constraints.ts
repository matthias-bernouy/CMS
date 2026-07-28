import { decodeIntegrationPackageFile } from "@bernouy/cms-integration-packages";
import type { OfficialBootstrapAnonymousConstraintGrandfathering } from "@bernouy/cms-integration-registry";
import { lintAnonymousConstraints } from "@bernouy/cms-integrations/supabase";
import type { BuiltOfficialIntegrationPackage } from "./contracts";

export function assertAnonymousConstraintGrandfathering(
    packages: readonly BuiltOfficialIntegrationPackage[],
    packagesByDigest: ReadonlyMap<string, BuiltOfficialIntegrationPackage>,
    grandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[],
): void {
    const approvedByLocation = new Map<string, OfficialBootstrapAnonymousConstraintGrandfathering>();
    let previousLocation = "";
    for (const entry of grandfathering) {
        if (!packagesByDigest.has(entry.packageDigest)) {
            throw new Error("Official anonymous constraint grandfathering targets an absent package digest");
        }
        const key = `${entry.packageDigest}\0${entry.path}`;
        if (approvedByLocation.has(key) || (previousLocation && previousLocation >= key)) {
            throw new Error("Official anonymous constraint grandfathering package paths must be unique and ordered");
        }
        approvedByLocation.set(key, entry);
        previousLocation = key;
    }
    for (const integrationPackage of packages) {
        for (const [path, file] of Object.entries(integrationPackage.package.envelope.files)) {
            if (!path.endsWith(".sql")) {
                continue;
            }
            const findings = lintAnonymousConstraints(
                new TextDecoder("utf-8", { fatal: true }).decode(decodeIntegrationPackageFile(file)),
                path,
            );
            const key = `${integrationPackage.digest}\0${path}`;
            const approved = approvedByLocation.get(key)?.findings ?? [];
            if (!sameAnonymousConstraintFindings(findings, approved)) {
                throw new Error("Official anonymous constraint grandfathering does not match the exact package bytes");
            }
            approvedByLocation.delete(key);
        }
    }
    if (approvedByLocation.size !== 0) {
        throw new Error("Official anonymous constraint grandfathering references a missing SQL package path");
    }
}

function sameAnonymousConstraintFindings(
    left: readonly Readonly<{ path: string; line: number; column: number; kind: string }>[],
    right: readonly Readonly<{ path: string; line: number; column: number; kind: string }>[],
): boolean {
    return (
        left.length === right.length &&
        left.every((finding, index) => {
            const expected = right[index];
            return (
                expected?.path === finding.path &&
                expected.line === finding.line &&
                expected.column === finding.column &&
                expected.kind === finding.kind
            );
        })
    );
}
