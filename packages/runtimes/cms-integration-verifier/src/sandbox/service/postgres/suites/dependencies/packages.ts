import type { SQL } from "bun";
import { join } from "node:path";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import { loadSupabaseSqlSchemas } from "@bernouy/cms-integrations/supabase";
import type { ExactDependencyPackage } from "../../../../../protocol";
import { createBoundedPackageMaterializer } from "../../../materialization";
import type { LoadedCandidatePackage, LoadedDependencyPackage } from "./types";

export type DependencyPackageLoader = Readonly<{
    loadCandidate(envelope: IntegrationPackageEnvelopeV1): Promise<LoadedCandidatePackage>;
    loadDependency(entry: ExactDependencyPackage): Promise<LoadedDependencyPackage>;
    dispose(): Promise<void>;
}>;

export function createDependencyPackageLoader(config: {
    packageTempRoot?: string;
    maxCachedPackages?: number;
}): DependencyPackageLoader {
    const materializer = createBoundedPackageMaterializer(config);
    return Object.freeze({
        async loadCandidate(envelope) {
            const packageDigest = await computeIntegrationPackageDigest(envelope);
            return {
                kind: envelope.kind,
                version: envelope.version,
                packageDigest,
                ...(await loadEnvelope(materializer, envelope)),
            };
        },
        async loadDependency(entry) {
            if ((await computeIntegrationPackageDigest(entry.envelope)) !== entry.packageDigest) {
                throw new TypeError("Dependency package bytes do not match their exact digest");
            }
            return { ...entry, ...(await loadEnvelope(materializer, entry.envelope)) };
        },
        async dispose() {
            await materializer.dispose();
        },
    });
}

export async function applyLoadedPackageSql(
    database: SQL,
    loaded: Pick<LoadedCandidatePackage, "root" | "definition">,
    signal: AbortSignal,
): Promise<void> {
    for (const connector of loaded.definition.connectors ?? []) {
        if (connector.provider !== "supabase" || !connector.schemas?.length) {
            continue;
        }
        const schemas = await loadSupabaseSqlSchemas(join(loaded.root, connector.root ?? "."), connector.schemas);
        for (const schema of schemas) {
            signal.throwIfAborted();
            await database.unsafe(schema.sql);
        }
    }
}

async function loadEnvelope(
    materializer: ReturnType<typeof createBoundedPackageMaterializer>,
    envelope: IntegrationPackageEnvelopeV1,
) {
    const root = await materializer.root(envelope);
    const definition = await loadIntegrationDefinitionFromVersionRoot({
        definitionPath: envelope.definition,
        expectedKind: envelope.kind,
        expectedVersion: envelope.version,
        versionRoot: root,
    });
    return { root, definition };
}
