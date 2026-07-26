import { SQL } from "bun";
import { join } from "node:path";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import {
    loadSupabaseSqlSchemas,
    readSupabaseObservedSchemaContract,
    type SupabaseSchemaCatalogQueryClient,
} from "@bernouy/cms-integrations/supabase";
import type { VerificationSandboxInput } from "../../supervisor";
import type { PostgresInstallAndReapplyAdapter } from "../postgres";
import { createBoundedPackageMaterializer } from "./materialization";

export type PostgresInstallAndReapplyAdapterConfig = Readonly<{
    packageTempRoot?: string;
    maxCachedPackages?: number;
}>;

export function createPostgresInstallAndReapplyAdapter(
    config: PostgresInstallAndReapplyAdapterConfig = {},
): PostgresInstallAndReapplyAdapter {
    const packages = createBoundedPackageMaterializer(config);
    return Object.freeze({
        async environmentVersions(signal: AbortSignal) {
            if (signal.aborted) {
                throw signal.reason;
            }
            return [
                { name: "bun", version: Bun.version },
                {
                    name: "postgres-image",
                    version:
                        "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
                },
            ];
        },
        async applyPackageSql(
            {
                package: envelope,
                database,
            }: Readonly<{
                package: VerificationSandboxInput["workload"]["package"];
                database: VerificationSandboxInput["database"];
                phase: "install" | "reapply";
            }>,
            signal: AbortSignal,
        ) {
            const started = performance.now();
            const root = await packages.root(envelope);
            const definition = await loadIntegrationDefinitionFromVersionRoot({
                definitionPath: envelope.definition,
                expectedKind: envelope.kind,
                expectedVersion: envelope.version,
                versionRoot: root,
            });
            const connectors = (definition.connectors ?? []).filter((connector) => connector.provider === "supabase");
            const sql = new SQL(database.connectionUri, { max: 1 });
            try {
                for (const connector of connectors) {
                    const schemas = await loadSupabaseSqlSchemas(
                        join(root, connector.root ?? "."),
                        connector.schemas ?? [],
                    );
                    for (const schema of schemas) {
                        if (signal.aborted) {
                            throw signal.reason;
                        }
                        await sql.unsafe(schema.sql);
                    }
                }
                const observed = [];
                for (const [index, connector] of connectors.entries()) {
                    const namespaces = connector.compatibility?.schema?.namespaces.map((entry) => entry.name) ?? [];
                    if ((connector.schemas?.length ?? 0) > 0 && namespaces.length === 0) {
                        throw new Error("SQL verification requires an exact declared schema contract");
                    }
                    if (namespaces.length > 0) {
                        observed.push(
                            await readSupabaseObservedSchemaContract({
                                client: catalogClient(sql),
                                owner: {
                                    connectorKey: connector.connectorKey ?? `${envelope.kind}-supabase-${index}`,
                                    lineageId: connector.lineageId ?? envelope.kind,
                                },
                                ownedNamespaces: namespaces,
                            }),
                        );
                    }
                }
                const evidenceDigest = await sha256Hex(canonicalJsonBytes(observed));
                return {
                    observedSchemaDigest: evidenceDigest,
                    evidenceDigest,
                    durationMs: Math.max(0, Math.round(performance.now() - started)),
                };
            } finally {
                await sql.close();
            }
        },
        async dispose() {
            await packages.dispose();
        },
    });
}

function catalogClient(database: SQL): SupabaseSchemaCatalogQueryClient {
    return {
        async query(statement, parameters) {
            const values = parameters.map((parameter) =>
                Array.isArray(parameter) ? database.array(parameter, "TEXT") : parameter,
            );
            return (await database.unsafe(statement, values)) as readonly Record<string, unknown>[];
        },
    };
}
