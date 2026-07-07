import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import type { IntegrationIcon } from "../../interfaces/Integration";
import { isRecord, text } from "./values";

export function parseIntegrationIcon(value: unknown, name = "definition.icon"): IntegrationIcon | undefined {
    if (value === undefined || value === null) return undefined;
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");

    const path = text(value.path);
    if (!path) throw new MissingIntegrationParam(`${name}.path`);

    return { path };
}
