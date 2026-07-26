import type { DeclarativeConnectorFunctionTemplate } from "./httpCompatibility";
import type { DeclarativeConnectorMigrationPlan } from "./migrations";

export type DeclarativeConnectorSchemaTemplate =
    | { path: string; manifest?: never }
    | { manifest: string; path?: never };

export type DeclarativeConnectorSchemaColumnContract = {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    identity?: "always" | "by-default";
    generated?: "stored";
    sequenceDependency?: "auto" | "internal";
};

export type DeclarativeConnectorSchemaRelationKind =
    | "table"
    | "partitioned-table"
    | "view"
    | "materialized-view"
    | "foreign-table";

export type DeclarativeConnectorSchemaForeignKeyAction =
    | "no-action"
    | "restrict"
    | "cascade"
    | "set-null"
    | "set-default";

type DeclarativeConnectorSchemaConstraintOptions = {
    deferrable?: boolean;
    initiallyDeferred?: boolean;
    validated?: boolean;
};

export type DeclarativeConnectorSchemaConstraintContract = DeclarativeConnectorSchemaConstraintOptions &
    (
        | { kind: "primary-key"; name: string; columns: string[] }
        | { kind: "unique"; name: string; columns: string[]; nullsNotDistinct: boolean }
        | {
              kind: "foreign-key";
              name: string;
              columns: string[];
              references: { namespace: string; relation: string; columns: string[] };
              onUpdate: DeclarativeConnectorSchemaForeignKeyAction;
              onDelete: DeclarativeConnectorSchemaForeignKeyAction;
              matchType?: "simple" | "full" | "partial";
          }
        | { kind: "check"; name: string; expression: string }
    );

export type DeclarativeConnectorSchemaRelationContract = {
    name: string;
    kind?: DeclarativeConnectorSchemaRelationKind;
    columns: DeclarativeConnectorSchemaColumnContract[];
    constraints: DeclarativeConnectorSchemaConstraintContract[];
};

export type DeclarativeConnectorSchemaNamespaceContract = {
    name: string;
    relations: DeclarativeConnectorSchemaRelationContract[];
};

export type DeclarativeConnectorSchemaContract = {
    namespaces: DeclarativeConnectorSchemaNamespaceContract[];
};

export type DeclarativeConnectorCompatibility = {
    schema?: DeclarativeConnectorSchemaContract;
};

export type DeclarativeConnectorTemplate = {
    provider: string;
    connectorKey?: string;
    lineageId?: string;
    migrationRevision?: number;
    migration?: DeclarativeConnectorMigrationPlan;
    root?: string;
    dataApiSchemas?: string[];
    schemas?: DeclarativeConnectorSchemaTemplate[];
    functions?: DeclarativeConnectorFunctionTemplate[];
    compatibility?: DeclarativeConnectorCompatibility;
};
