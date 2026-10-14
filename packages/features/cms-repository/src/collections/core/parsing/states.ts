import { parseUlviaSchema, type UlviaSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionState, CollectionStateScope } from "../../interfaces/CollectionState";
import { invalid, translateCollectionError } from "../errors";
import type { CollectionLimits } from "../limits";
import { array, identifier, integer, keys, ordinal, record, unique } from "../values";

const SCOPES = new Set<CollectionStateScope>(["param", "page", "session", "persistent"]);

export function parseCollectionStates(
    value: unknown,
    collectionId: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionState[] {
    const states = array(value ?? [], limits.maxStates, "$.states").map((entry, index) => {
        const path = `$.states[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "generation", "scope", "schema"], path);
        const id = identifier(source.id, `${path}.id`);
        if (`${collectionId}-${id}`.length > 128) {
            invalid("collection-owned state key must contain at most 128 characters", `${path}.id`);
        }
        const scope = source.scope;
        if (typeof scope !== "string" || !SCOPES.has(scope as CollectionStateScope)) {
            invalid("must be param, page, session or persistent", `${path}.scope`);
        }
        let schema: UlviaSchema;
        try {
            schema = parseUlviaSchema(source.schema, limits.schema);
        } catch (error) {
            return translateCollectionError(error, `${path}.schema`);
        }
        assertBrowserStateSchema(schema, scope as CollectionStateScope, `${path}.schema`);
        return {
            id,
            generation:
                source.generation === undefined
                    ? 1
                    : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`),
            scope: scope as CollectionStateScope,
            schema,
        };
    });
    unique(
        states.map(({ id }) => id),
        "$.states",
    );
    return states.sort((left, right) => ordinal(left.id, right.id));
}

function assertBrowserStateSchema(schema: UlviaSchema, scope: CollectionStateScope, path: string): void {
    if (schema.type === "binary") {
        invalid("browser state cannot contain binary values", path);
    }
    if (scope === "param") {
        if (("nullable" in schema && schema.nullable) || schema.type !== "string") {
            invalid("URL parameter state must use a nonnullable string schema", path);
        }
        return;
    }
    if (schema.type === "object") {
        Object.values(schema.properties).forEach((child) => assertBrowserStateSchema(child, scope, path));
    } else if (schema.type === "array") {
        assertBrowserStateSchema(schema.items, scope, path);
    } else if (schema.type === "map") {
        assertBrowserStateSchema(schema.values, scope, path);
    }
}
