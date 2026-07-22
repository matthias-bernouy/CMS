import { jsonResponse } from "../responses.ts";
import type { JsonRecord } from "../runtime.ts";
import { supabaseUrl } from "../runtime.ts";
import type { RouterContext } from "./types.ts";

export function handleSettingsRequests(context: RouterContext): Response | undefined {
    const { method, requestBody, state, url } = context;
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
