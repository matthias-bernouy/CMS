import { json } from "../../core/http.ts";
import { readJsonObject } from "../../core/records.ts";
import { rest, restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { boundedInteger, notificationMode } from "./values.ts";

const statuses = new Set(["pending", "processing", "retry", "delivered", "dead_letter", "suppressed"]);

export async function listNotificationDeliveries(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() ?? "";
    const limit = boundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    const query = new URLSearchParams({
        select: "id,event_id,rule_key,recipient_cms_user_id,status,attempts,available_at,last_error,created_at,delivered_at",
        order: "created_at.desc",
        limit: String(limit),
    });
    if (statuses.has(status)) {
        query.set("status", `eq.${status}`);
    }
    const items = await restJson<JsonRecord[]>(`notification_deliveries?${query.toString()}`);
    return json({ items, total: items.length, limit });
}

export async function notificationConfiguration(request: Request): Promise<Response> {
    if (request.method === "GET") {
        return json(await readConfiguration());
    }
    const mode = notificationMode((await readJsonObject(request)).mode);
    await rest("notification_configuration?id=eq.default", {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ mode, updated_at: new Date().toISOString() }),
    });
    return json(await readConfiguration());
}

async function readConfiguration(): Promise<JsonRecord> {
    const rows = await restJson<JsonRecord[]>(
        "notification_configuration?select=mode,updated_at&id=eq.default&limit=1",
    );
    return rows[0] ?? { mode: "builtin", updated_at: null };
}
