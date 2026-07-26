import { decodeIntegrationPackageFile, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type { OfficialBootstrapAnonymousConstraintGrandfathering } from "../../../../interfaces/publication";
import { lintAnonymousConstraints, type AnonymousConstraintFinding } from "@bernouy/cms-integrations/supabase";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function assertPackageAnonymousConstraintPolicy(
    integrationPackage: ResolvedIntegrationPackage,
    grandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[],
): void {
    const expected = expectedFindings(integrationPackage, grandfathering);
    const sqlPaths = Object.keys(integrationPackage.envelope.files)
        .filter((path) => path.endsWith(".sql"))
        .sort(compareText);
    for (const path of sqlPaths) {
        const file = integrationPackage.envelope.files[path]!;
        let sql: string;
        try {
            sql = utf8.decode(decodeIntegrationPackageFile(file));
        } catch (error) {
            throw new TypeError(`Integration SQL file must be valid UTF-8 for constraint lint: ${path}`, {
                cause: error,
            });
        }
        const actual = lintAnonymousConstraints(sql, path);
        const approved = expected.get(path) ?? [];
        if (!sameFindings(actual, approved)) {
            throw new TypeError(
                actual.length === 0
                    ? `Anonymous constraint grandfathering is stale for ${path}`
                    : `Integration SQL requires explicitly named CHECK and UNIQUE constraints: ${path}`,
            );
        }
        expected.delete(path);
    }
    const orphan = [...expected.keys()].sort(compareText)[0];
    if (orphan) {
        throw new TypeError(`Anonymous constraint grandfathering references a missing SQL file: ${orphan}`);
    }
}

function expectedFindings(
    integrationPackage: ResolvedIntegrationPackage,
    grandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[],
): Map<string, readonly AnonymousConstraintFinding[]> {
    const expected = new Map<string, readonly AnonymousConstraintFinding[]>();
    for (const entry of grandfathering) {
        if (entry.packageDigest !== integrationPackage.digest) {
            throw new TypeError("Anonymous constraint grandfathering must match the exact package digest");
        }
        if (!entry.path.endsWith(".sql") || expected.has(entry.path) || entry.findings.length === 0) {
            throw new TypeError("Anonymous constraint grandfathering must identify one non-empty unique SQL path");
        }
        if (entry.findings.some((finding) => finding.path !== entry.path)) {
            throw new TypeError("Anonymous constraint grandfathering findings must match their SQL path");
        }
        expected.set(entry.path, entry.findings);
    }
    return expected;
}

function sameFindings(
    actual: readonly AnonymousConstraintFinding[],
    expected: readonly AnonymousConstraintFinding[],
): boolean {
    return (
        actual.length === expected.length &&
        actual.every((finding, index) => {
            const approved = expected[index];
            return (
                approved?.path === finding.path &&
                approved.line === finding.line &&
                approved.column === finding.column &&
                approved.kind === finding.kind
            );
        })
    );
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
