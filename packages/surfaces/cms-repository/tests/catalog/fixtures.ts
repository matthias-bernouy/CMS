import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type {
    RepositoryCatalogDocument,
    RepositoryCatalogIntegrationPage,
    RepositoryCatalogIntegrationSummary,
    RepositoryCatalogPageRequestContext,
    RepositoryCatalogReader,
    RepositoryCatalogVersionContent,
    RepositoryCatalogVersionPage,
} from "@bernouy/cms-repository/catalog";

export const DIGEST = "a".repeat(64);

export const EMPTY_CONTEXT: RepositoryCatalogPageRequestContext = {
    searchParams: {},
    hasSearchParams: false,
};

export function queryContext(
    searchParams: Readonly<Record<string, readonly string[]>>,
): RepositoryCatalogPageRequestContext {
    return { searchParams, hasSearchParams: Object.keys(searchParams).length > 0 };
}

export function commerceSummary(): RepositoryCatalogIntegrationSummary {
    return {
        kind: "commerce",
        label: "Commerce",
        description: "Products, orders and checkout.",
        category: "Sales",
        stable: "1.0.0",
        latest: "1.1.0",
        technicalProviders: ["supabase", "stripe-webhooks"],
        artifacts: [
            { type: "source", count: 2 },
            { type: "bloc", count: 3 },
        ],
        compatibility: {
            admissionOutcome: "compatible",
            currentOutcome: "compatible",
            currentRevisionId: "commerce-current",
        },
        versions: [
            { version: "1.1.0", package: { digest: DIGEST, canonicalBytes: 2_048 } },
            { version: "1.0.0", package: { digest: "b".repeat(64), canonicalBytes: 1_024 } },
        ],
    };
}

export function newsletterSummary(): RepositoryCatalogIntegrationSummary {
    return {
        kind: "newsletter",
        label: "Newsletter",
        description: "Collect newsletter subscriptions.",
        category: "Marketing",
        stable: "1.0.0",
        latest: "1.0.0",
        technicalProviders: ["supabase"],
        compatibility: { admissionOutcome: "not-applicable", currentOutcome: "not-applicable" },
        versions: [{ version: "1.0.0" }],
    };
}

export function commerceVersion(version = "1.1.0"): RepositoryCatalogVersionContent {
    const definition: IntegrationDefinition = {
        kind: "commerce",
        version,
        label: "Commerce",
        description: "Commerce package details.",
        inputs: [],
        dependencies: [{ name: "Basic blocs", kind: "basic-blocs", versionRange: "^1.0.0", optional: true }],
        connectors: [{ provider: "supabase", schemas: [{ path: "sql" }] }],
        provisions: [{ provider: "stripe-webhooks", configuration: {}, outputs: [] }],
        artifacts: [
            { type: "bloc", bloc: { tag: "shop-cart", name: "Cart" } },
            { type: "bloc", bloc: { tag: "shop-product", name: "Product" } },
        ],
        ui: { instructions: [["Setup", "Use **safe configuration** before installing."]] },
    };
    return {
        version,
        definition,
        package: { digest: DIGEST, canonicalBytes: 2_048 },
        releaseNotes: "# Commerce 1.1\n\n- Added checkout retries.",
        compatibility: {
            admission: {
                id: "admission-1",
                reportType: "admission",
                outcome: "compatible",
                packageDigest: DIGEST,
                evaluator: { name: "cms-compatibility", version: "1.0.0" },
                baselines: [{ kind: "commerce", version: "1.0.0", packageDigest: "b".repeat(64) }],
                createdAt: "2026-07-26T09:00:00.000Z",
                releaseLevel: "minor",
                requiredReleaseLevel: "minor",
                admissible: true,
                evidence: [
                    {
                        classification: "additive",
                        surface: "definition",
                        code: "artifact-added",
                        path: "artifacts.shop-product",
                        message: "A public bloc was added.",
                    },
                ],
            },
            revisions: [
                {
                    id: "revision-2",
                    reportType: "revision",
                    outcome: "compatible",
                    admissible: true,
                    supersedes: "admission-1",
                    provenance: { reason: "Comparator update" },
                },
            ],
            currentRevisionId: "revision-2",
        },
    };
}

export function catalogReader(
    overrides: Partial<RepositoryCatalogReader> = {},
    revision = "catalog-revision-1",
): RepositoryCatalogReader {
    const commerce = commerceSummary();
    return {
        listIntegrations: async () => document([commerce, newsletterSummary()], revision),
        getIntegration: async (kind) =>
            kind === "commerce"
                ? document<RepositoryCatalogIntegrationPage>(
                      { integration: commerce, featuredVersion: commerceVersion() },
                      revision,
                  )
                : null,
        getVersion: async (kind, version) =>
            kind === "commerce" && commerce.versions.some((entry) => entry.version === version)
                ? document<RepositoryCatalogVersionPage>(
                      { integration: commerce, version: commerceVersion(version) },
                      revision,
                  )
                : null,
        ...overrides,
    };
}

export function document<T>(value: T, revision = "revision-1"): RepositoryCatalogDocument<T> {
    return { value, revision };
}
