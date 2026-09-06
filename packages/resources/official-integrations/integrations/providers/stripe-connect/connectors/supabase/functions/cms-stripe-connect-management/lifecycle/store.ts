import { HttpError, rest, restError, type JsonRecord } from "../core/runtime.ts";

export type Settings = {
    id: string;
    values: JsonRecord;
    saved_revision: string | null;
    applied_revision: string | null;
    operation: "idle" | "applying" | "pending_sync" | "failed";
    resources: JsonRecord[];
    operation_id?: string | null;
    operation_started_at?: string | null;
};
export async function readSettings(): Promise<Settings> {
    const response = await rest("source_settings?id=eq.default&select=*", { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]) {
        throw new HttpError(503, "Source settings storage is unavailable");
    }
    return rows[0];
}
export async function updateSettings(current: Settings, change: Partial<Settings>): Promise<Settings> {
    const revision = current.saved_revision === null ? "is.null" : `eq.${encodeURIComponent(current.saved_revision)}`;
    const attempt = current.operation_id ? `eq.${encodeURIComponent(current.operation_id)}` : "is.null";
    const response = await rest(
        `source_settings?id=eq.default&saved_revision=${revision}&operation=eq.${current.operation}&operation_id=${attempt}`,
        {
            method: "PATCH",
            headers: { "content-type": "application/json", prefer: "return=representation" },
            body: JSON.stringify(change),
        },
    );
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]) {
        throw new HttpError(409, "Settings changed; reload before retrying");
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
