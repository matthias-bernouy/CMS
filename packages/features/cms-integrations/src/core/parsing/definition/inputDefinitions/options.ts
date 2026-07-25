import type { IntegrationInputOption } from "../../../../interfaces/Integration";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../values";

export function parseOptionsList(values: unknown[], name: string): IntegrationInputOption[] {
    return values.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        }
        const label = text(entry.label);
        const value = text(entry.value);
        if (!label) {
            throw new MissingIntegrationParam(`${name}.${index}.label`);
        }
        if (!value) {
            throw new MissingIntegrationParam(`${name}.${index}.value`);
        }
        return { label, value };
    });
}
