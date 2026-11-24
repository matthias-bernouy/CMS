import type { UlviaSchema } from "ulvia-contracts/interfaces/UlviaSchema";
import { expectArray, expectString } from "ulvia-contracts/core/protocol/values";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
export function parseFilterKeys(value: unknown, schema: UlviaSchema, path: string): readonly string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const keys = expectArray(value, path, "invalid_contract").map((key) =>
        expectString(key, path, "invalid_contract", 64),
    );
    if (
        !keys.length ||
        keys.length > 8 ||
        new Set(keys).size !== keys.length ||
        schema.type !== "object" ||
        keys.some((key) => {
            const field = schema.type === "object" ? schema.properties[key] : undefined;
            return (
                !field ||
                !schema.required.includes(key) ||
                !["string", "integer", "number", "boolean"].includes(field.type) ||
                ("nullable" in field && field.nullable) ||
                ("sensitive" in field && field.sensitive) ||
                (field.type === "string" && field.maxLength > 256)
            );
        })
    ) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "filter keys must name 1 to 8 required nonsensitive scalar fields; strings are bounded to 256 UTF-16 units",
            path,
        );
    }
    return keys;
}
