import type {
    DeclarativeConnectorSchemaForeignKeyAction,
    DeclarativeConnectorSchemaRelationKind,
} from "./declarations";

export const OBSERVED_SCHEMA_CONTRACT_V1 = "cms.integration.observed-schema.v1" as const;

export type ObservedSchemaOwnerV1 = Readonly<{
    connectorKey: string;
    lineageId: string;
}>;

export type ObservedSchemaColumnV1 = Readonly<{
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    identity: "none" | "always" | "by-default";
    generated: "none" | "stored";
    sequenceDependency: "none" | "auto" | "internal";
}>;

type ObservedSchemaConstraintOptionsV1 = Readonly<{
    deferrable: boolean;
    initiallyDeferred: boolean;
    validated: boolean;
}>;

export type ObservedSchemaConstraintV1 = ObservedSchemaConstraintOptionsV1 &
    (
        | Readonly<{ kind: "primary-key"; name: string; columns: readonly string[] }>
        | Readonly<{
              kind: "unique";
              name: string;
              columns: readonly string[];
              nullsNotDistinct: boolean;
          }>
        | Readonly<{
              kind: "foreign-key";
              name: string;
              columns: readonly string[];
              references: Readonly<{
                  namespace: string;
                  relation: string;
                  columns: readonly string[];
              }>;
              onUpdate: DeclarativeConnectorSchemaForeignKeyAction;
              onDelete: DeclarativeConnectorSchemaForeignKeyAction;
              matchType: "simple" | "full" | "partial";
          }>
        | Readonly<{ kind: "check"; name: string; expression: string }>
    );

export type ObservedSchemaRelationV1 = Readonly<{
    name: string;
    kind: DeclarativeConnectorSchemaRelationKind;
    columns: readonly ObservedSchemaColumnV1[];
    constraints: readonly ObservedSchemaConstraintV1[];
}>;

export type ObservedSchemaNamespaceV1 = Readonly<{
    name: string;
    relations: readonly ObservedSchemaRelationV1[];
}>;

export type ObservedSchemaContractV1 = Readonly<{
    schema: typeof OBSERVED_SCHEMA_CONTRACT_V1;
    owner: ObservedSchemaOwnerV1;
    namespaces: readonly ObservedSchemaNamespaceV1[];
}>;

export type ObservedSchemaContractIdentity = Readonly<{
    canonicalBytes: Uint8Array;
    digest: string;
}>;
