import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import {
    RepositoryCms,
    type RepositoryCompatibilityPageRequest,
    type RepositoryCompatibilityReader,
    type RepositoryCompatibilityReportSource,
} from "@bernouy/cms-repository";
import { TestRunner } from "../testRunner";

export const PACKAGE_DIGEST = "a".repeat(64);
export const BASELINE_DIGEST = "b".repeat(64);
export const DOWNLOAD_DIGEST = "c".repeat(64);

export function admission(): RepositoryCompatibilityReportSource {
    const report: RepositoryCompatibilityReportSource & Readonly<{ path: string; source: string }> = {
        id: "admission-1",
        reportType: "admission",
        kind: "demo",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        evaluator: { name: "cms-compatibility", version: "1.0.0" },
        createdAt: "2026-07-26T09:00:00.000Z",
        baselines: [],
        informationalBaselines: [
            {
                kind: "demo",
                version: "0.9.0",
                packageDigest: BASELINE_DIGEST,
                path: "/registry/private/baseline.json",
                source: "internal-baseline-source",
            },
        ],
        evidence: [
            {
                classification: "compatible",
                surface: "definition",
                code: "contract-preserved",
                message: "The public contract is preserved.",
                path: "/registry/private/definition.json",
                source: "internal-evidence-source",
            },
        ],
        outcome: "compatible",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        admissible: true,
        noBaselineReason: "new-major",
        path: "/registry/private/admission.json",
        source: "top-level-internal-source",
    };
    return report;
}

export function revision(id = "revision-1", supersedes = "admission-1"): RepositoryCompatibilityReportSource {
    return {
        ...admission(),
        id,
        reportType: "revision",
        createdAt: "2026-07-26T10:00:00.000Z",
        releaseLevel: "patch",
        supersedes,
        provenance: {
            actor: "private-admin@example.test",
            reason: "Comparator update",
            evidenceIds: ["ci-evidence-1"],
            source: "internal-management-request",
            path: "/private/audit/42",
        },
    };
}

export function mutableCompatibilityReader(initial: readonly RepositoryCompatibilityReportSource[] = []) {
    const revisions = [...initial];
    const requests: RepositoryCompatibilityPageRequest[] = [];
    const reader: RepositoryCompatibilityReader = {
        list: async (kind, version, page = {}) => {
            requests.push(page);
            if (kind !== "demo" || version !== "1.0.0") {
                return null;
            }
            const start = page.after ? revisions.findIndex(({ id }) => id === page.after) + 1 : 0;
            if (page.after && start === 0) {
                throw Object.assign(new Error("Compatibility history cursor does not exist"), {
                    status: 400,
                    publicCode: "invalid_compatibility_cursor",
                });
            }
            const limit = page.limit ?? 50;
            const selected = revisions.slice(start, start + limit);
            const hasMore = start + selected.length < revisions.length;
            return {
                admission: admission(),
                current: revisions.at(-1) ?? admission(),
                revisions: selected,
                totalRevisions: revisions.length,
                ...(hasMore ? { nextCursor: selected.at(-1)?.id } : {}),
            };
        },
    };
    return {
        reader,
        requests,
        append(value: RepositoryCompatibilityReportSource) {
            revisions.push(value);
        },
    };
}

export function mounted(reader: RepositoryCompatibilityReader, withPackage = false): TestRunner {
    const runner = new TestRunner();
    if (withPackage) {
        new RepositoryCms({
            runner,
            integrationCatalog: emptyCatalog(),
            integrationCompatibility: reader,
            integrationPackages: packageSource(),
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
        });
    } else {
        new RepositoryCms({ runner, integrationCatalog: emptyCatalog(), integrationCompatibility: reader });
    }
    return runner;
}

function packageSource(): IntegrationPackageSource {
    return {
        getPackage: async () => ({
            envelope: {
                schema: "cms.integration.package.v1",
                kind: "demo",
                version: "1.0.0",
                definition: "definition.json",
                files: { "definition.json": { encoding: "utf8", content: "{}" } },
            },
            canonicalBytes: new TextEncoder().encode("{}"),
            digest: DOWNLOAD_DIGEST,
        }),
    };
}

function emptyCatalog(): IntegrationDefinitionRepository {
    return {
        list: async () => [],
        getIndex: async () => null,
        listVersions: async () => [],
        get: async () => null,
    };
}
