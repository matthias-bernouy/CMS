import { z } from "zod";
import { parseUlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { ResourceBrowserState } from "../interfaces";

export function invalid(message: string, path: string): never {
    throw new TypeError(`${path}: ${message}`);
}
const header = z.strictObject({
    id: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/u)
        .max(96),
    scope: z.enum(["param", "page", "session", "persistent"]),
    schema: z.unknown(),
});
export function resourceStates(input: unknown): readonly ResourceBrowserState[] {
    const states = z
        .array(header)
        .max(128)
        .parse(input)
        .map((state) => {
            const schema = parseUlviaSchema(state.schema);
            assertBrowserStateSchema(schema, state.scope);
            return { ...state, schema };
        });
    if (new Set(states.map(({ id }) => id)).size !== states.length) {
        invalid("Duplicate browser state", "states");
    }
    return states;
}
function assertBrowserStateSchema(schema: UlviaSchema, scope: ResourceBrowserState["scope"]): void {
    if (schema.type === "binary") {
        invalid("Browser state cannot contain binary values", "states");
    }
    if (scope === "param") {
        if (schema.type !== "string" || ("nullable" in schema && schema.nullable)) {
            invalid("URL state must be a nonnullable string", "states");
        }
    } else if (schema.type === "object") {
        Object.values(schema.properties).forEach((child) => assertBrowserStateSchema(child, scope));
    } else if (schema.type === "array") {
        assertBrowserStateSchema(schema.items, scope);
    } else if (schema.type === "map") {
        assertBrowserStateSchema(schema.values, scope);
    }
}
