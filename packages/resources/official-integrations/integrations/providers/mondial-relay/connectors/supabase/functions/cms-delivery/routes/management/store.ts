import { HttpError } from "../../http.ts";
import { restJson } from "../../shipment/supabase/client.ts";
import type { JsonRecord } from "../../shipment/types.ts";
export type Settings = {
    id: string;
    values: JsonRecord;
    saved_revision: string | null;
    applied_revision: string | null;
    operation: string;
};
export async function readSettings(): Promise<Settings> {
    const rows = await restJson<Settings[]>("source_settings?id=eq.default&select=*", { method: "GET" });
    if (!rows[0]) {
        throw new HttpError(503, "Connection settings unavailable");
    }
    return rows[0];
}
export async function updateSettings(current: Settings, change: Partial<Settings>): Promise<Settings> {
    const revision = current.saved_revision === null ? "is.null" : `eq.${encodeURIComponent(current.saved_revision)}`;
    const rows = await restJson<Settings[]>(
        `source_settings?id=eq.default&saved_revision=${revision}&operation=eq.${current.operation}`,
        {
            method: "PATCH",
            headers: { "content-type": "application/json", prefer: "return=representation" },
            body: JSON.stringify(change),
        },
    );
    if (!rows[0]) {
        throw new HttpError(409, "Connection settings changed; reload before retrying");
    }
    return rows[0];
}
export function settingsResult(settings: Settings) {
    return {
        values: settings.values,
        savedRevision: settings.saved_revision,
        appliedRevision: settings.applied_revision,
        operation: settings.operation,
    };
}
