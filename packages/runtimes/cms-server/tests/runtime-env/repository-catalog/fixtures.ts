import type {
    IntegrationDefinition,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
} from "@bernouy/cms-integrations";
import { HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";

export const PACKAGE_DIGEST = "a".repeat(64);
export const VERIFICATION_DIGEST = "b".repeat(64);
const COMPATIBILITY_ETAG = "c".repeat(64);
const APPENDED_COMPATIBILITY_ETAG = "d".repeat(64);
const NOTES_ETAG = "e".repeat(64);
const RELEASE_ETAG = "f".repeat(64);

export type FetchRecord = Readonly<{ url: URL; init: RequestInit | undefined }>;

export function catalogFixture(options: Readonly<{ appended?: () => boolean }> = {}) {
    const requests: FetchRecord[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        requests.push({ url, init });
        if (url.pathname.endsWith("/api/integrations/package")) {
            if (init?.method !== "HEAD") {
                throw new Error("Package bodies must not be fetched by the catalog reader");
            }
            return new Response(null, {
                headers: {
                    "content-length": "2048",
                    "content-type": "application/json; charset=utf-8",
                    etag: `"${PACKAGE_DIGEST}"`,
                    "x-cms-integration-package-digest": PACKAGE_DIGEST,
                },
            });
        }
        if (url.pathname.endsWith("/api/integrations/release-notes")) {
            return textResponse("# Release notes\n\nSafe Markdown.\n", NOTES_ETAG, "text/markdown; charset=utf-8");
        }
        if (url.pathname.endsWith("/api/integrations/compatibility")) {
            const appended = options.appended?.() ?? false;
            return jsonResponse(
                compatibilityPage(url, appended),
                appended ? APPENDED_COMPATIBILITY_ETAG : COMPATIBILITY_ETAG,
            );
        }
        if (url.pathname.endsWith("/api/integrations/release")) {
            return jsonResponse(releaseDocument(url.searchParams.get("version") ?? "1.0.0"), RELEASE_ETAG);
        }
        throw new Error(`Unexpected repository request: ${url.pathname}`);
    };
    return {
        requests,
        catalog: new FixtureDefinitionRepository(),
        reader: new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: fetchImpl,
        }),
        fetch: fetchImpl,
    };
}

export function releaseDocument(version: string) {
    const reportDigest = "c".repeat(64);
    return {
        kind: "commerce",
        version,
        packageDigest: PACKAGE_DIGEST,
        status: "installable",
        installable: true,
        freshInstallOnly: false,
        verificationDigest: VERIFICATION_DIGEST,
        compatibility: {
            reportId: `compatibility-${version}`,
            reportDigest,
            origin: "legacy-backfill",
            outcome: "compatible",
            contractAdmissible: true,
            releaseLevel: version === "1.0.0" ? "initial" : "minor",
            requiredReleaseLevel: "none",
            evaluator: { name: "compatibility", version: "2.0.0" },
            baselines: [],
            findings: [],
        },
        verification: {
            reportId: `verification-${version}`,
            reportDigest,
            origin: "legacy-backfill",
            createdAt: "2026-07-26T10:00:00.000Z",
            outcome: "passed",
            runner: { name: "cms-schema-generator", version: "1.0.0", imageDigest: "sha256:pinned" },
            environment: { digest: reportDigest, versions: { postgres: "16.9" } },
            policy: { name: "official", version: "1.0.0", snapshotDigest: reportDigest },
            activeContracts: [{ contractId: "public-api", ownerVersion: "1.0.0", digest: reportDigest }],
            results: [
                {
                    suiteId: "sql-install-and-reapply",
                    source: "platform",
                    required: true,
                    outcome: "passed",
                    durationMs: 12,
                    attempts: 1,
                    cacheHit: false,
                    diagnostics: [],
                },
            ],
        },
        migrations: [
            {
                reportId: `migration-${version}`,
                reportDigest,
                origin: "admission",
                source: { kind: "commerce", version: "1.0.0", packageDigest: "d".repeat(64) },
                supportedSourceRange: "^1.0.0",
                connectorKey: "primary",
                lineageId: "commerce-supabase-v1",
                migrationRevision: 1,
                outcome: "passed",
                runner: { name: "cms-postgres-migration", version: "1.0.0", imageDigest: "sha256:migration" },
                environmentDigest: "e".repeat(64),
                checks: {
                    freshInstall: { outcome: "passed", evidenceDigest: "f".repeat(64) },
                    migratedState: { outcome: "passed", evidenceDigest: "a".repeat(64) },
                    equivalence: { outcome: "passed", evidenceDigest: "b".repeat(64) },
                    failureInjection: { outcome: "passed", evidenceDigest: "c".repeat(64) },
                    resumption: { outcome: "passed", evidenceDigest: "d".repeat(64) },
                },
                cutover: { cmsMediated: "binding-revision", providerDirect: "expand-in-code" },
                cutoverEvidence: {
                    cmsMediated: { outcome: "passed", evidenceDigest: reportDigest },
                    providerDirect: { outcome: "passed", evidenceDigest: reportDigest },
                    activation: { outcome: "passed", evidenceDigest: reportDigest },
                },
                rollback: "available",
                pointOfNoReturn: "cleanup",
                delayedCleanupVerified: true,
                operationalEvidence: {
                    downtime: { status: "zero-downtime", observedSeconds: 0, evidenceDigest: reportDigest },
                    drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
                    rollback: { capability: "available", verified: true, evidenceDigest: reportDigest },
                    pointOfNoReturn: {
                        phase: "cleanup",
                        observation: "crossed",
                        evidenceDigest: reportDigest,
                    },
                    cleanup: { delaySeconds: 60, observed: true, evidenceDigest: reportDigest },
                },
            },
        ],
        decision: {
            decisionId: `decision-${version}`,
            decisionDigest: reportDigest,
            admissible: true,
            reasons: [],
            createdAt: "2026-07-26T12:00:00.000Z",
            policy: { name: "official", version: "1.0.0", snapshotDigest: reportDigest },
        },
    };
}

export class FixtureDefinitionRepository implements IntegrationDefinitionRepository {
    async list() {
        return [
            {
                kind: "commerce",
                label: "Commerce",
                description: "Commerce tools",
                category: "business",
                stable: "1.0.0",
                latest: "1.1.0",
                versions: ["1.0.0", "1.1.0"],
            },
        ];
    }

    async getIndex(): Promise<IntegrationDefinitionIndex> {
        return {
            kind: "commerce",
            label: "Commerce",
            description: "Commerce tools",
            category: "business",
            stable: "1.0.0",
            latest: "1.1.0",
            versions: [
                {
                    version: "1.0.0",
                    path: "versions/1.0.0",
                    definition: "versions/1.0.0/definition.json",
                    verificationDigest: VERIFICATION_DIGEST,
                },
                {
                    version: "1.1.0",
                    path: "versions/1.1.0",
                    definition: "versions/1.1.0/definition.json",
                    verificationDigest: VERIFICATION_DIGEST,
                },
            ],
        };
    }

    async listVersions() {
        return (await this.getIndex()).versions;
    }

    async get(kind: string, version = "1.0.0"): Promise<IntegrationDefinition | null> {
        if (kind !== "commerce" || !["1.0.0", "1.1.0"].includes(version)) {
            return null;
        }
        return {
            kind,
            version,
            label: "Commerce",
            description: `Commerce ${version}`,
            inputs: [],
            connectors: [{ provider: "supabase", schemas: [], functions: [] }],
            provisions: [{ provider: "stripe", configuration: {}, outputs: [] }],
            dependencies: [{ name: "Core", kind: "core", versionRange: "^1.0.0" }],
            artifacts: [
                { type: "source", id: "products", source: { name: "products", type: "api", fields: [] } },
                { type: "source", id: "orders", source: { name: "orders", type: "api", fields: [] } },
            ],
        } as IntegrationDefinition;
    }
}

export function compatibilityPage(url: URL, appended: boolean) {
    const version = url.searchParams.get("version") ?? "1.0.0";
    const root = report(version, "admission-1", "root", "not-applicable");
    const first = report(version, "revision-1", "revision", "compatible", root.reportId);
    const second = report(version, "revision-2", "revision", "breaking", "revision-1");
    const revisions = appended ? [first, second] : [first];
    return {
        root,
        current: revisions.at(-1),
        revisions,
        totalRevisions: revisions.length,
    };
}

function report(
    version: string,
    reportId: string,
    revisionType: "root" | "revision",
    outcome: string,
    supersedes?: string,
) {
    return {
        reportId,
        revisionType,
        origin: "admission",
        kind: "commerce",
        version,
        packageDigest: PACKAGE_DIGEST,
        evaluator: { name: "compatibility", version: "2.0.0" },
        createdAt: "2026-07-26T12:00:00.000Z",
        baselines: [],
        informationalBaselines: [],
        findings: [
            {
                findingId: "b".repeat(64),
                classification: "compatible",
                surface: "definition",
                code: "definition-stable",
                message: "Stable",
            },
        ],
        outcome,
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: outcome !== "breaking",
        noBaselineReason: "new-kind",
        provenance: { reason: "Comparator update", evidenceIds: ["ci-1"] },
        ...(revisionType === "revision" ? { supersedes } : {}),
    };
}

export function jsonResponse(value: unknown, validator = COMPATIBILITY_ETAG): Response {
    return textResponse(JSON.stringify(value), validator, "application/json; charset=utf-8");
}

export function textResponse(value: string, validator: string, contentType: string): Response {
    return new Response(value, {
        headers: {
            "content-length": String(new TextEncoder().encode(value).byteLength),
            "content-type": contentType,
            etag: `"${validator}"`,
        },
    });
}
