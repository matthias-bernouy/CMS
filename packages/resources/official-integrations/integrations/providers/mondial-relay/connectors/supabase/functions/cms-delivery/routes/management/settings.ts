import { HttpError, isRecord } from "../../http.ts";
import type { JsonRecord } from "../../shipment/types.ts";
import definitions from "./fields.json" with { type: "json" };
import { readSettings, settingsResult, updateSettings } from "./store.ts";

export async function saveSettings(input: JsonRecord) {
    const current = await readSettings();
    if (current.operation === "pending_sync") {
        throw new HttpError(409, "Finish applying before saving again");
    }
    if (input.expectedRevision !== current.saved_revision) {
        throw new HttpError(409, "Settings revision changed");
    }
    const values = isRecord(input.values) ? input.values : input;
    const next: JsonRecord = {};
    for (const field of definitions) {
        const value = values[field.name] ?? field.defaultValue ?? "";
        if (typeof value !== "string" || value.length > 500) {
            throw new HttpError(422, "Invalid Connection setting");
        }
        if (field.secret && value && !/^\$\{[A-Za-z0-9_-]+\}$/.test(value)) {
            throw new HttpError(422, "Select a secret reference");
        }
        if (field.options && !field.options.some((option) => option.value === value)) {
            throw new HttpError(422, "Select an official provider endpoint");
        }
        next[field.name] = value.trim();
    }
    return settingsResult(
        await updateSettings(current, { values: next, saved_revision: crypto.randomUUID(), operation: "idle" }),
    );
}
export function configured(values: JsonRecord, secrets: JsonRecord): boolean {
    return definitions.every((field) => Boolean(field.secret ? secrets[field.name] : values[field.name]));
}
