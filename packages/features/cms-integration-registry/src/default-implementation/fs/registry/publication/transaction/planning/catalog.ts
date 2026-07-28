import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { assertBuiltIntegrationRegistryCatalogSnapshot } from "cms-integration-registry/core/catalog/snapshot";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";

const CATALOG_REVISION_SCHEMA = "cms.integration.registry.catalog-revision.v1" as const;

export type IdentifiedCatalogRevision = Readonly<{
    revisionId: string;
    digest: string;
}>;

export async function identifyCatalogRevision(
    snapshot: IntegrationRegistryCatalogSnapshot,
): Promise<IdentifiedCatalogRevision> {
    assertBuiltIntegrationRegistryCatalogSnapshot(snapshot);
    const entries = snapshot.summaries.map((summary) => {
        const index = snapshot.getIndex(summary.kind);
        if (!index) {
            throw new Error(`Catalog snapshot lost integration index ${summary.kind}`);
        }
        return {
            index,
            versions: index.versions.map((entry) => {
                const location = snapshot.locateExactVersion(index.kind, entry.version);
                if (!location) {
                    throw new Error(`Catalog snapshot lost exact version ${index.kind}@${entry.version}`);
                }
                return {
                    kind: location.kind,
                    version: location.version,
                    definitionSnapshot: location.definitionSnapshot,
                    package: location.package,
                    ...(location.releaseNotes ? { releaseNotes: location.releaseNotes } : {}),
                    ...(location.legacy ? { legacy: true } : {}),
                };
            }),
        };
    });
    const digest = await sha256Hex(
        canonicalJsonBytes({
            schema: CATALOG_REVISION_SCHEMA,
            health: snapshot.health,
            entries,
        }),
    );
    return Object.freeze({ revisionId: `catalog-${digest}`, digest });
}
