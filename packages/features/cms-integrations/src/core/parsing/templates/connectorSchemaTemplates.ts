import { IntegrationInputError } from "../../errors";
import type { DeclarativeConnectorTemplate } from "../../../interfaces/Integration";
import { isRecord, text } from "../definition/values";

export function parseConnectorSchemas(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorTemplate["schemas"]> {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        if (typeof entry === "string") {
            return { path: entry };
        }
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be a string or object");
        }
        const keys = Object.keys(entry);
        if (keys.length !== 1 || (keys[0] !== "path" && keys[0] !== "manifest")) {
            throw new IntegrationInputError(`${name}.${index}`, "must define exactly one path or manifest");
        }
        const key = keys[0];
        const reference = text(entry[key]);
        if (!reference) {
            throw new IntegrationInputError(`${name}.${index}.${key}`, "must be a non-empty string");
        }
        return key === "path" ? { path: reference } : { manifest: reference };
    });
}
