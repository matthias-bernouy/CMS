import { json } from "../../core/http.ts";
import { HttpError } from "../../core/errors.ts";
import { readJsonObject } from "../../core/records.ts";
import { rest, restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { boundedInteger, boundedText, notificationMode } from "./values.ts";

const statuses = new Set(["pending", "processing", "retry", "delivered", "dead_letter", "suppressed"]);

export async function listNotificationDeliveries(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() ?? "";
    const limit = boundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    const query = new URLSearchParams({
        select: "id,event_id,rule_key,recipient_cms_user_id,recipient_role,status,attempts,available_at,last_error,created_at,delivered_at",
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
    const body = await readJsonObject(request);
    const mode = notificationMode(body.mode);
    const configuration: JsonRecord = { mode, updated_at: new Date().toISOString() };
    if (body.adminRecipientCmsUserIds !== undefined) {
        configuration.admin_recipient_cms_user_ids = recipientIds(body.adminRecipientCmsUserIds);
    }
    await rest("notification_configuration?id=eq.default", {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(configuration),
    });
    return json(await readConfiguration());
}

async function readConfiguration(): Promise<JsonRecord> {
    const rows = await restJson<JsonRecord[]>(
        "notification_configuration?select=mode,admin_recipient_cms_user_ids,updated_at&id=eq.default&limit=1",
    );
    const row = rows[0];
    return {
        mode: row?.mode ?? "builtin",
        adminRecipientCmsUserIds: Array.isArray(row?.admin_recipient_cms_user_ids)
            ? row.admin_recipient_cms_user_ids
            : [],
        updated_at: row?.updated_at ?? null,
    };
}

function recipientIds(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 50) {
        throw new HttpError(400, "adminRecipientCmsUserIds must be an array of at most 50 CMS user ids");
    }
    return [...new Set(value.map((item) => boundedText(item, "administrator CMS user id", 512)))];
}
