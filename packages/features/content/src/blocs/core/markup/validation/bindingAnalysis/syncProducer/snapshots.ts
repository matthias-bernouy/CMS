import type { BindingCapability, BindingCapabilityError, BindingCapabilityVariant, BindingValueSchema } from "../types";

const REQUEST_ID: BindingValueSchema = { type: "string", format: "uuid", maxLength: 36 };
const STATUS: BindingValueSchema = { type: "integer", minimum: 100, maximum: 599 };
const CODE: BindingValueSchema = { type: "string", maxLength: 128 };

export function fallbackVariant(capability: BindingCapability): BindingCapabilityVariant {
    return {
        input: capability.input ?? { type: "object", properties: {}, required: [] },
        output: capability.output,
        errors: capability.errors,
    };
}

export function operationSnapshots(
    effect: "query" | "mutation",
    capability: BindingCapabilityVariant,
): BindingValueSchema[] {
    return outcomeSchemas(capability.errors).map((outcome) => {
        const properties: Record<string, BindingValueSchema> = {
            activity: {
                type: "string",
                enum: effect === "query" ? ["idle", "waiting", "fetching"] : ["idle", "submitting"],
                maxLength: effect === "query" ? 8 : 10,
            },
            hasData: { type: "boolean" },
            data: nullable(capability.output),
            outcome,
            input: capability.input,
        };
        const required = ["activity", "hasData", "data", "outcome"];
        if (effect === "mutation") {
            properties.lastSuccess = {
                type: "object",
                nullable: true,
                properties: { requestId: REQUEST_ID, status: STATUS, data: capability.output },
                required: ["requestId", "status", "data"],
            };
            properties.dirty = { type: "boolean" };
            required.push("lastSuccess", "dirty");
        }
        return { type: "object", properties, required };
    });
}

function outcomeSchemas(errors: readonly BindingCapabilityError[]): BindingValueSchema[] {
    return [
        outcome("none"),
        outcome("success", { status: STATUS, requestId: REQUEST_ID }, ["status"]),
        outcome("failure", { code: CODE, retryable: { type: "boolean" }, status: STATUS, requestId: REQUEST_ID }, [
            "code",
            "retryable",
        ]),
        ...errors.map((error) =>
            outcome(
                "error",
                {
                    code: { type: "string", enum: [error.code], maxLength: error.code.length },
                    retryable: { type: "boolean" },
                    status: STATUS,
                    requestId: REQUEST_ID,
                    ...(error.output ? { output: error.output } : {}),
                },
                ["code", "retryable", "status"],
            ),
        ),
    ];
}

function outcome(
    kind: "none" | "success" | "failure" | "error",
    properties: Readonly<Record<string, BindingValueSchema>> = {},
    required: readonly string[] = [],
): BindingValueSchema {
    return {
        type: "object",
        properties: {
            kind: { type: "string", enum: [kind], maxLength: kind.length },
            ...properties,
        },
        required: ["kind", ...required],
    };
}

function nullable(schema: BindingValueSchema): BindingValueSchema {
    return schema.type === "null" || schema.nullable ? schema : { ...schema, nullable: true };
}
