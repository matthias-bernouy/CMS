import { jsonResponse } from "../responses.ts";
import type { JsonRecord } from "../runtime.ts";
import { supabaseUrl } from "../runtime.ts";
import type { RouterContext } from "./types.ts";

export function handleSettingsRequests(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/source_settings" && method === "GET") {
        return jsonResponse([state.sourceSettingsRow]);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/source_settings" && method === "PATCH") {
        const expectedRevision =
            state.sourceSettingsRow.saved_revision === null
                ? "is.null"
                : `eq.${String(state.sourceSettingsRow.saved_revision)}`;
        if (
            url.searchParams.get("saved_revision") !== expectedRevision ||
            url.searchParams.get("operation") !== `eq.${String(state.sourceSettingsRow.operation)}`
        ) {
            return jsonResponse([]);
        }
        Object.assign(state.sourceSettingsRow, JSON.parse(requestBody));
        return jsonResponse([state.sourceSettingsRow]);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/settings" && method === "POST") {
        const row = JSON.parse(requestBody) as JsonRecord;
        state.settingRow = {
            ...state.settingRow,
            ...row,
            id: "default",
            updated_at: "2026-07-02T11:00:00.000Z",
        };
        return jsonResponse([state.settingRow], 201);
    }
    if (url.origin === supabaseUrl && url.pathname === "/rest/v1/settings" && method === "GET") {
        return jsonResponse([state.settingRow], 200);
    }
    return undefined;
}
