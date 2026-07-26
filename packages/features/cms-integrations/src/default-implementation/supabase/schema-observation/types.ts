import type {
    ObservedSchemaColumnV1,
    ObservedSchemaConstraintV1,
    ObservedSchemaOwnerV1,
    ObservedSchemaRelationV1,
} from "../../../interfaces/IntegrationConnectorDeployer";

export interface SupabaseSchemaCatalogQueryClient {
    query(statement: string, parameters: readonly unknown[]): Promise<readonly Record<string, unknown>[]>;
}

export type ReadSupabaseObservedSchemaContractOptions = Readonly<{
    client: SupabaseSchemaCatalogQueryClient;
    owner: ObservedSchemaOwnerV1;
    ownedNamespaces: readonly string[];
}>;

export type MutableObservedRelation = {
    name: string;
    kind: ObservedSchemaRelationV1["kind"];
    columns: Map<string, MutableObservedColumn>;
    constraints: ObservedSchemaConstraintV1[];
};

export type MutableObservedColumn = {
    value: Omit<ObservedSchemaColumnV1, "sequenceDependency">;
    sequenceDependencies: Set<ObservedSchemaColumnV1["sequenceDependency"]>;
};

export type MutableObservedNamespace = {
    name: string;
    relations: Map<string, MutableObservedRelation>;
};
