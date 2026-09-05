import { resolve } from "node:path";
import { discoverWorkspacePackages } from "../architecture/core/files/workspaceDiscovery";
import { toRelativePath } from "../architecture/core/pathUtils";
import { discoverIntegrationCatalog } from "./catalog";
import { inferTransitiveOwnership } from "./importGraph";
import { scanPackageSources } from "./source/scan";
import type { IntegrationOwnershipAudit, IntegrationOwnershipFinding } from "./types";

const OFFICIAL_PACKAGE_NAME = "@bernouy/cms-official-integrations";

export async function auditIntegrationOwnership(repositoryRoot: string): Promise<IntegrationOwnershipAudit> {
    const root = resolve(repositoryRoot);
    const catalog = await discoverIntegrationCatalog(root);
    const packages = await discoverWorkspacePackages(root, []);
    const manifestFindings: IntegrationOwnershipFinding[] = [];
    for (const pkg of packages) {
        if (pkg.name === OFFICIAL_PACKAGE_NAME) {
            continue;
        }
        const dependencyGroups = [
            pkg.manifest.dependencies,
            (pkg.manifest as { devDependencies?: Record<string, string> }).devDependencies,
            pkg.manifest.optionalDependencies,
            pkg.manifest.peerDependencies,
        ];
        if (dependencyGroups.some((dependencies) => dependencies?.[OFFICIAL_PACKAGE_NAME] !== undefined)) {
            manifestFindings.push({
                confidence: "high",
                evidence: "official-package-dependency",
                file: `${toRelativePath(root, pkg.root)}/package.json`,
                message: `Package ${pkg.name} depends on the concrete official integration authoring package.`,
                owners: [],
            });
        }
    }

    const scanned = await scanPackageSources(root, packages, catalog);
    const transitive = inferTransitiveOwnership(root, scanned.sources, scanned.findings);
    return {
        catalog,
        findings: normalizeFindings([...manifestFindings, ...scanned.findings, ...transitive]),
    };
}

export function formatIntegrationOwnershipFindings(findings: readonly IntegrationOwnershipFinding[]): string {
    return findings
        .map((finding) => {
            const location = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
            return `[${finding.confidence}][${finding.evidence}] ${location}: ${finding.message}`;
        })
        .join("\n");
}

function normalizeFindings(findings: readonly IntegrationOwnershipFinding[]): IntegrationOwnershipFinding[] {
    const unique = new Map<string, IntegrationOwnershipFinding>();
    for (const finding of findings) {
        const key = [finding.evidence, finding.file, finding.line ?? "", finding.message].join("\0");
        unique.set(key, finding);
    }
    return [...unique.values()].sort(
        (left, right) =>
            left.file.localeCompare(right.file) ||
            (left.line ?? 0) - (right.line ?? 0) ||
            left.evidence.localeCompare(right.evidence),
    );
}
