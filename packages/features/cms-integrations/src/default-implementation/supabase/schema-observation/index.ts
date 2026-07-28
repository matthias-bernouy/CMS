import { parseObservedSchemaContractV1 } from "../../../core/parsing/templates/connector-compatibility";
import type { ObservedSchemaContractV1 } from "../../../interfaces/IntegrationConnectorDeployer";
import { addObservedConstraints } from "./constraints";
import {
    SUPABASE_SCHEMA_COLUMN_QUERY,
    SUPABASE_SCHEMA_CONSTRAINT_QUERY,
    SUPABASE_SCHEMA_NAMESPACE_QUERY,
    SUPABASE_SCHEMA_RELATION_QUERY,
} from "./queries";
import {
    addObservedColumns,
    addObservedRelations,
    createObservedNamespaces,
    finalizeObservedNamespaces,
} from "./relations";
import type { ReadSupabaseObservedSchemaContractOptions } from "./types";

export type { ReadSupabaseObservedSchemaContractOptions, SupabaseSchemaCatalogQueryClient } from "./types";

export async function readSupabaseObservedSchemaContract(
    options: ReadSupabaseObservedSchemaContractOptions,
): Promise<ObservedSchemaContractV1> {
    const ownedNamespaces = validateOwnedNamespaces(options.ownedNamespaces);
    const parameters = [ownedNamespaces] as const;
    const namespaceRows = await options.client.query(SUPABASE_SCHEMA_NAMESPACE_QUERY, parameters);
    const relationRows = await options.client.query(SUPABASE_SCHEMA_RELATION_QUERY, parameters);
    const columnRows = await options.client.query(SUPABASE_SCHEMA_COLUMN_QUERY, parameters);
    const constraintRows = await options.client.query(SUPABASE_SCHEMA_CONSTRAINT_QUERY, parameters);
    const namespaces = createObservedNamespaces(ownedNamespaces, namespaceRows);
    addObservedRelations(namespaces, relationRows);
    addObservedColumns(namespaces, columnRows);
    addObservedConstraints(namespaces, constraintRows);
    return parseObservedSchemaContractV1({
        schema: "cms.integration.observed-schema.v1",
        owner: options.owner,
        namespaces: finalizeObservedNamespaces(namespaces),
    });
}

function validateOwnedNamespaces(namespaces: readonly string[]): string[] {
    if (namespaces.length === 0 || namespaces.length > 128) {
        throw new TypeError("PostgreSQL schema observation requires between 1 and 128 owned namespaces");
    }
    const normalized = [...namespaces].sort(compareText);
    for (const [index, namespace] of normalized.entries()) {
        if (!namespace || new TextEncoder().encode(namespace).byteLength > 63 || namespace.includes("\0")) {
            throw new TypeError("Owned PostgreSQL namespaces must be non-empty identifiers of at most 63 UTF-8 bytes");
        }
        if (index > 0 && namespace === normalized[index - 1]) {
            throw new TypeError(`Owned PostgreSQL namespace "${namespace}" is duplicated`);
        }
    }
    return normalized;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
