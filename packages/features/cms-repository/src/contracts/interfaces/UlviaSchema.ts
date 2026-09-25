export type UlviaStringFormat = "date" | "date-time" | "email" | "uri" | "uuid";

interface UlviaSchemaBase {
    readonly description?: string;
    readonly nullable?: true;
}

export interface UlviaStringSchema extends UlviaSchemaBase {
    readonly type: "string";
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
    readonly type: "binary";
    readonly maxBytes: number;
    readonly mediaTypes: readonly string[];
}

export type UlviaSchema =
    | UlviaArraySchema
    | UlviaBinarySchema
    | UlviaBooleanSchema
    | UlviaMapSchema
    | UlviaNullSchema
    | UlviaNumberSchema
    | UlviaObjectSchema
    | UlviaStringSchema;

export type UlviaScalarSchema = UlviaBooleanSchema | UlviaNullSchema | UlviaNumberSchema | UlviaStringSchema;
