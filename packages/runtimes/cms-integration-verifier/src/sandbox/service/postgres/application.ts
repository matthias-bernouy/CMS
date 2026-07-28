import { SQL } from "bun";
import { join } from "node:path";
import { canonicalJsonBytes, sha256Hex, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import { identifyObservedSchemaContract, projectObservedSchemaContract } from "@bernouy/cms-integrations";
import {
    loadSupabaseSqlSchemas,
    readSupabaseObservedSchemaContract,
    type SupabaseSchemaCatalogQueryClient,
} from "@bernouy/cms-integrations/supabase";
import { createBoundedPackageMaterializer } from "../materialization";
import type { LoadedSqlPackage, ObservedConnectorSchema, SqlConnectorPlan } from "./types";

export type SqlPackageLoader = Readonly<{
    load(envelope: IntegrationPackageEnvelopeV1): Promise<LoadedSqlPackage>;
    dispose(): Promise<void>;
}>;

export function createSqlPackageLoader(config: {
    packageTempRoot?: string;
    maxCachedPackages?: number;
}): SqlPackageLoader {
    const packages = createBoundedPackageMaterializer(config);
    return Object.freeze({
        async load(envelope) {
            const root = await packages.root(envelope);
            const definition = await loadIntegrationDefinitionFromVersionRoot({
                definitionPath: envelope.definition,
                expectedKind: envelope.kind,
                expectedVersion: envelope.version,
                versionRoot: root,
            });
            return { root, definition, connectors: connectorPlans(definition.connectors ?? [], envelope.kind) };
        },
        async dispose() {
            await packages.dispose();
        },
    });
}

export async function applyPackageSql(database: SQL, loaded: LoadedSqlPackage, signal: AbortSignal): Promise<void> {
    for (const connector of loaded.connectors) {
        const schemas = await loadSupabaseSqlSchemas(join(loaded.root, connector.root), connector.schemas);
        for (const schema of schemas) {
            signal.throwIfAborted();
            await database.unsafe(schema.sql);
        }
    }
}

export async function observeConnectorSchemas(
    database: SQL,
    connectors: readonly SqlConnectorPlan[],
): Promise<ObservedConnectorSchema[]> {
    const client = catalogClient(database);
    return await Promise.all(
        connectors.map(async (connector) => {
            const observed = await readSupabaseObservedSchemaContract({
                client,
                owner: { connectorKey: connector.connectorKey, lineageId: connector.lineageId },
                ownedNamespaces: connector.ownedNamespaces,
            });
            return {
                connectorKey: connector.connectorKey,
                lineageId: connector.lineageId,
                declaredDigest: await sha256Hex(canonicalJsonBytes(connector.declaredSchema)),
                observedDigest: (await identifyObservedSchemaContract(observed)).digest,
                observed,
            };
        }),
    );
}

export async function projectedObservedDigest(observed: ObservedConnectorSchema): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(projectObservedSchemaContract(observed.observed)));
}

function connectorPlans(
    connectors: NonNullable<Awaited<ReturnType<typeof loadIntegrationDefinitionFromVersionRoot>>["connectors"]>,
    kind: string,
): SqlConnectorPlan[] {
    const plans = connectors
        .map((connector, index) => ({ connector, index }))
        .filter(({ connector }) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0)
        .map(({ connector, index }) => {
            const declaredSchema = connector.compatibility?.schema;
            if (!declaredSchema || !connector.schemas) {
                throw new Error("SQL verification requires an exact declared schema contract");
            }
            const ownedNamespaces = declaredSchema.namespaces.map((entry) => entry.name).toSorted();
            if (ownedNamespaces.length === 0) {
                throw new Error("SQL verification requires at least one declared owned namespace");
            }
            const dataApiSchemas = [...(connector.dataApiSchemas ?? [])].toSorted();
            if (dataApiSchemas.some((namespace) => !ownedNamespaces.includes(namespace))) {
                throw new Error("Every Data API schema must be part of the connector's declared owned roots");
            }
            return {
                connectorKey: connector.connectorKey ?? `${kind}-supabase-${index}`,
                lineageId: connector.lineageId ?? kind,
                root: connector.root ?? ".",
                schemas: connector.schemas,
                declaredSchema,
                ownedNamespaces,
                dataApiSchemas,
            };
        });
    const owners = new Map<string, string>();
    for (const plan of plans) {
        for (const namespace of plan.ownedNamespaces) {
            const previous = owners.get(namespace);
            if (previous) {
                throw new Error(`Owned namespace ${namespace} is shared by ${previous} and ${plan.connectorKey}`);
            }
            owners.set(namespace, plan.connectorKey);
        }
    }
    return plans;
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
