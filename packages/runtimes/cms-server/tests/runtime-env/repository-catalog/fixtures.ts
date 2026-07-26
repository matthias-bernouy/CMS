import type {
    IntegrationDefinition,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
} from "@bernouy/cms-integrations";
import { HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";

export const PACKAGE_DIGEST = "a".repeat(64);
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
    const verificationDigest = "b".repeat(64);
    const reportDigest = "c".repeat(64);
    return {
        kind: "commerce",
        version,
        packageDigest: PACKAGE_DIGEST,
        status: "installable",
        installable: true,
        freshInstallOnly: false,
        verificationDigest,
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
            outcome: "passed",
            runner: { name: "cms-schema-generator", version: "1.0.0", imageDigest: "sha256:pinned" },
            environment: { digest: reportDigest, versions: { postgres: "16.9" } },
            policy: { name: "official", version: "1.0.0", snapshotDigest: reportDigest },
            results: [
                {
                    suiteId: "sql-install-and-reapply",
                    source: "platform",
                    required: true,
                    outcome: "passed",
                    attempts: 1,
                    cacheHit: false,
                    diagnostics: [],
                },
            ],
        },
        migrations: [],
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
                { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
                { version: "1.1.0", path: "versions/1.1.0", definition: "versions/1.1.0/definition.json" },
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
    const admission = report(version, "admission-1", "admission", "not-applicable");
    const first = report(version, "revision-1", "revision", "compatible", "admission-1");
    const second = report(version, "revision-2", "revision", "breaking", "revision-1");
    const revisions = appended ? [first, second] : [first];
    return {
        admission,
        current: revisions.at(-1),
        revisions,
        totalRevisions: revisions.length,
    };
}

function report(
    version: string,
    id: string,
    reportType: "admission" | "revision",
    outcome: string,
    supersedes?: string,
) {
    return {
        id,
        reportType,
        kind: "commerce",
        version,
        packageDigest: PACKAGE_DIGEST,
        evaluator: { name: "compatibility", version: "2.0.0" },
        createdAt: "2026-07-26T12:00:00.000Z",
        baselines: [],
        informationalBaselines: [],
        evidence: [
            { classification: "compatible", surface: "definition", code: "definition-stable", message: "Stable" },
        ],
        outcome,
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        admissible: outcome !== "breaking",
        noBaselineReason: "new-kind",
        ...(reportType === "revision"
            ? { supersedes, provenance: { reason: "Comparator update", evidenceIds: ["ci-1"] } }
            : {}),
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
