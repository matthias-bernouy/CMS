import type { DeclarativeConnectorFunctionTemplate } from "./httpCompatibility";

export type DeclarativeConnectorSchemaTemplate =
    | { path: string; manifest?: never }
    | { manifest: string; path?: never };

export type DeclarativeConnectorSchemaColumnContract = {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
};

export type DeclarativeConnectorSchemaForeignKeyAction =
    | "no-action"
    | "restrict"
    | "cascade"
    | "set-null"
    | "set-default";

export type DeclarativeConnectorSchemaConstraintContract =
    | { kind: "primary-key"; name: string; columns: string[] }
    | { kind: "unique"; name: string; columns: string[]; nullsNotDistinct: boolean }
    | {
          kind: "foreign-key";
          name: string;
          columns: string[];
          references: { namespace: string; relation: string; columns: string[] };
          onUpdate: DeclarativeConnectorSchemaForeignKeyAction;
          onDelete: DeclarativeConnectorSchemaForeignKeyAction;
      }
    | { kind: "check"; name: string; expression: string };

export type DeclarativeConnectorSchemaRelationContract = {
    name: string;
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
    root?: string;
    dataApiSchemas?: string[];
    schemas?: DeclarativeConnectorSchemaTemplate[];
    functions?: DeclarativeConnectorFunctionTemplate[];
    compatibility?: DeclarativeConnectorCompatibility;
};
