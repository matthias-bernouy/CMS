import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import { identifyCompatibilityReportV2 } from "@bernouy/cms-integration-verification";
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
    return {
        schema: "cms.integration.compatibility-report.v2",
        reportId: "admission-1",
        revisionType: "root",
        origin: "admission",
        createdAt: "2026-07-26T09:00:00.000Z",
        kind: "demo",
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        evaluator: { name: "cms-compatibility", version: "2.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [
            {
                findingId: "b51ab3cc141991012ec0abc4c32a0232cc87f1aa30a3235a01be2bdc8e2600a3",
                classification: "compatible",
                surface: "definition",
                path: "/registry/private/definition.json",
                code: "contract-preserved",
                baselineDigest: PACKAGE_DIGEST,
                candidateDigest: PACKAGE_DIGEST,
                message: "The public contract is preserved.",
            },
        ],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: true,
        noBaselineReason: "new-kind",
        provenance: {
            actor: "private-registry-service",
            reason: "Initial static evaluation",
        },
    };
}

export function revision(id = "revision-1", supersedes = "admission-1"): RepositoryCompatibilityReportSource {
    return {
        ...admission(),
        reportId: id,
        revisionType: "revision",
        createdAt: "2026-07-26T10:00:00.000Z",
        supersedes,
        provenance: {
            actor: "private-admin",
            reason: "Comparator update",
            evidenceIds: ["ci-evidence-1"],
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
            const start = page.after ? revisions.findIndex(({ reportId }) => reportId === page.after) + 1 : 0;
            if (page.after && start === 0) {
                throw Object.assign(new Error("Compatibility history cursor does not exist"), {
                    status: 400,
                    publicCode: "invalid_compatibility_cursor",
                });
            }
            const limit = page.limit ?? 50;
            const selected = revisions.slice(start, start + limit);
            const hasMore = start + selected.length < revisions.length;
            const root = admission();
            const current = revisions.at(-1) ?? root;
            return {
                root,
                current,
                currentRevisionId: current.reportId,
                currentReportDigest: (await identifyCompatibilityReportV2(current)).digest,
                revisions: selected,
                totalRevisions: revisions.length,
                ...(hasMore ? { nextCursor: selected.at(-1)?.reportId } : {}),
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
