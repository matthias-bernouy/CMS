import { ReleaseValidationError } from "../protocol/errors";
import { deepFreeze } from "../protocol/values";
import type { CapabilityDefinition } from "../../interfaces/ContractRelease";
import type { CompiledHttpBinding, CompiledHttpBody } from "../../interfaces/HttpBinding";
import { assertJsonCompatible } from "./jsonCompatibility";
import { compileParameterMap } from "./parameters";
import { parsePathTemplate, routeKey } from "./pathTemplate";
import { compileResponse } from "./response";

export function compileHttpBinding(capability: CapabilityDefinition): CompiledHttpBinding {
    const definition = capability.binding;
    const path = `capability ${capability.id}.binding`;
    if ((definition.method === "GET" || definition.method === "HEAD") && capability.behavior.effect !== "query") {
        throw new ReleaseValidationError("invalid_binding", `${definition.method} capabilities must be queries`, path);
    }
    const template = parsePathTemplate(definition.path, `${path}.path`);
    const used = new Set<string>();
    const pathParameters = compileParameterMap(
        definition.input?.path,
        "path",
        capability.input,
        used,
        `${path}.input.path`,
    );
    assertPathMappings(template.placeholders, pathParameters, `${path}.input.path`);
    const query = compileParameterMap(definition.input?.query, "query", capability.input, used, `${path}.input.query`);
    const headers = compileParameterMap(
        definition.input?.headers,
        "header",
        capability.input,
        used,
        `${path}.input.headers`,
    );
    const body = compileBody(capability, used, path);
    const missing = Object.keys(capability.input.properties).filter((property) => !used.has(property));
    if (missing.length > 0) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `unmapped input properties: ${missing.sort().join(", ")}`,
            `${path}.input`,
        );
    }
    if ((definition.method === "GET" || definition.method === "HEAD") && body) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `${definition.method} capabilities cannot have a body`,
            path,
        );
    }
    return deepFreeze({
        method: definition.method,
        path: definition.path,
        routeKey: routeKey(definition.method, definition.path),
        pathParameters,
        query,
        headers,
        body,
        response: compileResponse(
            definition.response,
            capability.errors,
            capability.output,
            capability.behavior.execution,
            definition.method,
            `${path}.response`,
        ),
    }) as CompiledHttpBinding;
}

function compileBody(capability: CapabilityDefinition, used: Set<string>, path: string): CompiledHttpBody | null {
    const definition = capability.binding.input?.body;
    if (definition === undefined) {
        return null;
    }
    if (definition !== true && "binaryProperty" in definition) {
        return compileBinaryBody(definition.binaryProperty, capability, used, path);
    }
    const properties =
        definition === true
            ? Object.keys(capability.input.properties).filter((name) => !used.has(name))
            : [...definition.properties];
    if (properties.length === 0 || new Set(properties).size !== properties.length) {
        throw new ReleaseValidationError(
            "invalid_binding",
            "body properties must be non-empty and unique",
            `${path}.input.body`,
        );
    }
    for (const property of properties) {
        if (!Object.hasOwn(capability.input.properties, property)) {
            throw new ReleaseValidationError(
                "invalid_binding",
                `body maps unknown input property ${JSON.stringify(property)}`,
                `${path}.input.body`,
            );
        }
        if (used.has(property)) {
            throw new ReleaseValidationError(
                "invalid_binding",
                `input property ${JSON.stringify(property)} is mapped more than once`,
                `${path}.input.body`,
            );
        }
        assertJsonCompatible(capability.input.properties[property]!, `${path}.input.body.${property}`);
        used.add(property);
    }
    return { kind: "json", contentTypes: ["application/json"], properties: properties.sort() };
}

function compileBinaryBody(
    property: string,
    capability: CapabilityDefinition,
    used: Set<string>,
    path: string,
): CompiledHttpBody {
    const schema = capability.input.properties[property];
    if (!schema || schema.type !== "binary") {
        throw new ReleaseValidationError(
            "invalid_binding",
            `binary body must map one declared binary property, received ${JSON.stringify(property)}`,
            `${path}.input.body`,
        );
    }
    if (used.has(property)) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `input property ${JSON.stringify(property)} is mapped more than once`,
            `${path}.input.body`,
        );
    }
    if (!capability.input.required.includes(property) || schema.nullable) {
        throw new ReleaseValidationError(
            "invalid_binding",
            "binary body property must be required and non-nullable",
            `${path}.input.body`,
        );
    }
    used.add(property);
    return { kind: "binary", contentTypes: [], property };
}

function assertPathMappings(
    placeholders: readonly string[],
    parameters: readonly { readonly wireName: string }[],
    path: string,
): void {
    const declared = parameters.map((parameter) => parameter.wireName).sort();
    const expected = [...placeholders].sort();
    if (declared.length !== expected.length || declared.some((name, index) => name !== expected[index])) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `path mappings must exactly match placeholders: ${expected.join(", ") || "none"}`,
            path,
        );
    }
}
