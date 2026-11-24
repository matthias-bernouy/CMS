import type { UlviaSchema } from "ulvia-contracts/interfaces/UlviaSchema";
import type {
    ResolvedSchemaBinding,
    ResolvedSchemaResult,
    SchemaResolutionOptions,
} from "ulvia-contracts/interfaces/SchemaResolution";
import { canonicalizeIJson } from "ulvia-contracts/core/protocol/canonical";
import { parseUlviaSchema } from "ulvia-contracts/core/language/schema/parseSchema";
import { validateSchemaValue } from "ulvia-contracts/core/language/schema/validateValue";
import { containsResolvedSchema, referenceValue, resolvedSchemaNodes } from "./traverse";
import { parseSchemaDescriptor, SchemaResolutionError, schemaDescriptorProjection } from "./descriptor";
import { RESOLVED_SCHEMA_LIMITS } from "./protocol";
export async function resolveSchema(
    schema: UlviaSchema,
    value: unknown,
    options: SchemaResolutionOptions,
): Promise<ResolvedSchemaResult> {
    const nodes = resolvedSchemaNodes(schema);
    if (nodes.length > 32) {
        throw new SchemaResolutionError("SCHEMA_RESOLUTION_LIMIT");
    }
    if (!nodes.length) {
        return { schema, bindings: [] };
    }
    const cache = new Map<string, ResolvedSchemaBinding["descriptor"]>();
    const bindings: ResolvedSchemaBinding[] = [];
    let bytes = 0;
    for (const { path, schema: declaration } of nodes) {
        const resolver = options.capabilities.find(({ id }) => id === declaration.resolver);
        if (!resolver?.schemaResolver) {
            throw new SchemaResolutionError("SCHEMA_RESOLVER_UNAVAILABLE", path);
        }
        let selectorJson: string;
        let requestedVersion: string | undefined;
        try {
            const selector = Object.fromEntries(
                Object.entries(declaration.selector).map(([name, ref]) => [
                    name,
                    referenceValue(ref, value, options.input),
                ]),
            );
            validateSchemaValue(resolver.schemaResolver.selector, selector);
            selectorJson = canonicalizeIJson(selector);
            if (Buffer.byteLength(selectorJson) > 16384) {
                throw new TypeError("Selector exceeds its byte limit");
            }
            let version: unknown;
            if (declaration.version) {
                try {
                    version = referenceValue(declaration.version, value, options.input);
                } catch (error) {
                    if (!options.allowLatest) {
                        throw error;
                    }
                }
            }
            if (version !== undefined && typeof version !== "string" && !Number.isSafeInteger(version)) {
                throw new TypeError("Invalid schema version");
            }
            requestedVersion = version === undefined ? undefined : String(version);
        } catch (cause) {
            throw new SchemaResolutionError("INVALID_SELECTOR", path, { cause });
        }
        const key = canonicalizeIJson({ resolver: resolver.id, selectorJson, version: requestedVersion ?? null });
        let descriptor = cache.get(key);
        if (!descriptor) {
            const query = { selectorJson, ...(requestedVersion === undefined ? {} : { version: requestedVersion }) };
            validateSchemaValue(resolver.input, query);
            const wire = await options.invoke(resolver, query);
            bytes += Buffer.byteLength(canonicalizeIJson(wire));
            if (bytes > 2097152) {
                throw new SchemaResolutionError("SCHEMA_RESOLUTION_LIMIT", path);
            }
            descriptor = parseSchemaDescriptor(wire);
            if (requestedVersion !== undefined && descriptor.version !== requestedVersion) {
                throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT", path);
            }
            await options.seal(resolver, descriptor);
            cache.set(key, descriptor);
        }
        bindings.push({
            path,
            declaration,
            selectorJson,
            ...(requestedVersion === undefined ? {} : { requestedVersion }),
            descriptor,
        });
    }
    return { schema: applySchemaBindings(schema, bindings), bindings };
}
export function applySchemaBindings(
    schema: UlviaSchema,
    bindings: readonly ResolvedSchemaBinding[],
    visible = false,
): UlviaSchema {
    if (!containsResolvedSchema(schema)) {
        return schema;
    }
    function visit(current: UlviaSchema, path: string): UlviaSchema {
        if (current.type === "resolved") {
            const bound = bindings.find(
                (entry) => entry.path === path && entry.declaration.resolver === current.resolver,
            );
            if (!bound) {
                throw new SchemaResolutionError("SCHEMA_RESOLVER_UNAVAILABLE", path);
            }
            const replacement = visible ? schemaDescriptorProjection(bound.descriptor) : bound.descriptor.schema;
            return {
                ...replacement,
                ...(current.nullable && replacement.type !== "null" ? { nullable: true } : {}),
                ...(current.description === undefined ? {} : { description: current.description }),
            };
        }
        if (current.type === "object") {
            return {
                ...current,
                properties: Object.fromEntries(
                    Object.entries(current.properties).map(([name, child]) => [
                        name,
                        visit(child, `${path}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`),
                    ]),
                ),
            };
        }
        if (current.type === "array") {
            return { ...current, items: visit(current.items, `${path}/*`) };
        }
        if (current.type === "map") {
            return { ...current, values: visit(current.values, `${path}/*`) };
        }
        return current;
    }
    return parseUlviaSchema(visit(schema, ""), RESOLVED_SCHEMA_LIMITS);
}
