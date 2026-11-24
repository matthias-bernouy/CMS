export type UlviaStringFormat = "date" | "date-time" | "email" | "uri" | "uuid";

interface UlviaSchemaBase {
    readonly description?: string;
    readonly nullable?: true;
}

export interface UlviaStringSchema extends UlviaSchemaBase {
    readonly type: "string";
    /** Sensitive values are valid contract inputs but must be redacted from captures, logs, and audit payloads. */
    readonly sensitive?: true;
    readonly enum?: readonly string[];
    readonly format?: UlviaStringFormat;
    readonly maxLength: number;
    readonly minLength?: number;
}

export interface UlviaNumberSchema extends UlviaSchemaBase {
    readonly type: "number" | "integer";
    readonly maximum?: number;
    readonly minimum?: number;
}

export interface UlviaBooleanSchema extends UlviaSchemaBase {
    readonly type: "boolean";
}

export interface UlviaNullSchema extends Omit<UlviaSchemaBase, "nullable"> {
    readonly type: "null";
}

export interface UlviaObjectSchema extends UlviaSchemaBase {
    readonly type: "object";
    readonly maxProperties?: number;
    readonly minProperties?: number;
    readonly properties: Readonly<Record<string, UlviaSchema>>;
    readonly required: readonly string[];
}

export interface UlviaMapSchema extends UlviaSchemaBase {
    readonly type: "map";
    readonly maxKeyLength: number;
    readonly maxProperties: number;
    readonly minProperties?: number;
    readonly values: UlviaSchema;
}

export interface UlviaArraySchema extends UlviaSchemaBase {
    readonly type: "array";
    readonly items: UlviaSchema;
    readonly maxItems: number;
    readonly minItems?: number;
}

export interface UlviaBinarySchema extends UlviaSchemaBase {
    readonly resource?: true;
    readonly type: "binary";
    readonly maxBytes: number;
}

/** Paths are JSON pointers into the complete value being validated, or the capability's input. */
export interface UlviaSchemaReference {
    readonly source: "value" | "input";
    readonly path: string;
}
/** A contract-owned synchronous query supplies the concrete JSON schema for this field. */
export interface UlviaResolvedSchema extends UlviaSchemaBase {
    readonly type: "resolved";
    readonly resolver: string;
    readonly selector: Readonly<Record<string, UlviaSchemaReference>>;
    readonly version?: UlviaSchemaReference;
    readonly choices?: string;
}
export interface SchemaField {
    readonly id: string;
    readonly property: string;
    readonly label: string;
    readonly sensitive: boolean;
}
export interface SchemaDescriptor {
    readonly resourceId: string;
    readonly version: string;
    readonly digest: string;
    readonly schema: UlviaSchema;
    readonly fields: readonly SchemaField[];
}

export type UlviaSchema =
    | UlviaArraySchema
    | UlviaBinarySchema
    | UlviaBooleanSchema
    | UlviaMapSchema
    | UlviaNullSchema
    | UlviaNumberSchema
    | UlviaObjectSchema
    | UlviaStringSchema
    | UlviaResolvedSchema;

export type UlviaScalarSchema = UlviaBooleanSchema | UlviaNullSchema | UlviaNumberSchema | UlviaStringSchema;
