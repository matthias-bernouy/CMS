import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { BindingFacts, BindingScope, BindingVariable } from "./model";
import type { BindingValueSchema } from "./types";

export function resolveBindingPath(path: string, scope: BindingScope, facts: BindingFacts): BindingVariable {
    if (path === "." || path.startsWith("cms.") || path.startsWith("$source")) {
        return { kind: "unknown" };
    }
    const segments = path.split(".");
    const root = segments.shift()!;
    const variable = scope.get(root);
    if (!variable) {
        throw issue(`binding references unknown value ${JSON.stringify(root)}`);
    }
    if (variable.kind === "unknown" || segments.length === 0) {
        return variable;
    }
    return variable.kind === "query"
        ? resolveQueryPath(root, segments, variable, facts)
        : { kind: "schema", schema: resolveSchemaPath(variable.schema, segments, root, facts) };
}

function resolveQueryPath(
    name: string,
    segments: string[],
    variable: Extract<BindingVariable, { kind: "query" }>,
    facts: BindingFacts,
): BindingVariable {
    const [head, ...tail] = segments;
    if (head === "activity") {
        return scalar("string", tail, `${name}.activity`);
    }
    if (head === "hasData") {
        return scalar("boolean", tail, `${name}.hasData`);
    }
    if (head === "input") {
        return { kind: "unknown" };
    }
    if (head === "data") {
        if (!facts.data.has(name)) {
            throw issue(`${name}.data requires an ancestor branch proving ${name}.hasData or a successful outcome`);
        }
        return {
            kind: "schema",
            schema: resolveSchemaPath(variable.capability.output, tail, `${name}.data`, facts),
        };
    }
    if (head !== "outcome") {
        throw issue(`binding path ${JSON.stringify(`${name}.${segments.join(".")}`)} does not exist`);
    }
    return resolveOutcomePath(name, tail, variable, facts);
}

function resolveOutcomePath(
    name: string,
    segments: string[],
    variable: Extract<BindingVariable, { kind: "query" }>,
    facts: BindingFacts,
): BindingVariable {
    const [head, ...tail] = segments;
    if (head === "kind" || head === "code" || head === "requestId") {
        return scalar("string", tail, `${name}.outcome.${head}`);
    }
    if (head === "retryable") {
        return scalar("boolean", tail, `${name}.outcome.retryable`);
    }
    if (head === "status") {
        return scalar("integer", tail, `${name}.outcome.status`);
    }
    if (head !== "output") {
        throw issue(`binding path ${JSON.stringify(`${name}.outcome.${segments.join(".")}`)} does not exist`);
    }
    const codes = facts.errorCodes.get(name);
    if (!codes || codes.size !== 1) {
        throw issue(`${name}.outcome.output requires an ancestor branch selecting one declared error code`);
    }
    const code = [...codes][0]!;
    const error = variable.capability.errors.find((candidate) => candidate.code === code);
    if (!error?.output) {
        throw issue(`declared error ${JSON.stringify(code)} has no output`);
    }
    return { kind: "schema", schema: resolveSchemaPath(error.output, tail, `${name}.outcome.output`, facts) };
}

function resolveSchemaPath(
    root: BindingValueSchema,
    segments: readonly string[],
    rootPath: string,
    facts: BindingFacts,
): BindingValueSchema {
    let schema = root;
    let path = rootPath;
    for (const segment of segments) {
        if (schema.type === "object") {
            const property = schema.properties[segment];
            if (!property) {
                throw issue(
                    `binding path ${JSON.stringify(`${path}.${segment}`)} is not declared by the output schema`,
                );
            }
            schema = property;
        } else if (schema.type === "map") {
            schema = schema.values;
        } else if (schema.type === "array" && segment === "length") {
            schema = { type: "integer" };
        } else if (schema.type === "array" && /^\d+$/u.test(segment)) {
            const index = Number(segment);
            if ((facts.minimumLengths.get(path) ?? schema.minItems ?? 0) <= index) {
                throw issue(
                    `binding path ${JSON.stringify(`${path}.${segment}`)} requires a proven length greater than ${index}`,
                );
            }
            schema = schema.items;
        } else {
            throw issue(`binding path ${JSON.stringify(`${path}.${segment}`)} cannot traverse ${schema.type}`);
        }
        path += `.${segment}`;
    }
    return schema;
}

function scalar(type: "string" | "boolean" | "integer", tail: string[], path: string): BindingVariable {
    if (tail.length > 0) {
        throw issue(`binding path ${JSON.stringify(`${path}.${tail.join(".")}`)} cannot traverse ${type}`);
    }
    return { kind: "schema", schema: { type, ...(type === "string" ? { nullable: true as const } : {}) } };
}

function issue(message: string): ContentValidationError {
    return new ContentValidationError("content", message);
}
