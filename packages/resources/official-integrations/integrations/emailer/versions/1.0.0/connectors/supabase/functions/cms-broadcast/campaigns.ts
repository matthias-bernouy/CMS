import { json } from "./http.ts";
import { countFromContentRange, firstRow, qs, rest, restError, restJson } from "./rest.ts";
import { HttpError, type CampaignRow, type JsonRecord } from "./types.ts";
import { idParam, intValue } from "./values.ts";

const campaignSelect = "id,status,template_key,shared_data,rate_per_minute,scheduled_at,started_at,finished_at,total_count,sent_count,failed_count,skipped_count,created_at,updated_at";

export async function listCampaigns(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = intValue(url.searchParams.get("limit"), "limit", 50, 1, 200);
    const offset = intValue(url.searchParams.get("offset"), "offset", 0, 0, 1000000);
    const query = qs({ select: campaignSelect, order: "created_at.desc", limit, offset });
    const response = await rest(`campaigns?${query}`, { method: "GET", headers: { prefer: "count=exact" } });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as CampaignRow[];
    return json({ items: rows.map(publicCampaign), total: countFromContentRange(response.headers.get("content-range")) ?? rows.length, limit, offset });
}

export async function getCampaign(request: Request): Promise<Response> {
    const id = idParam(request);
    const rows = await restJson<CampaignRow[]>(`campaigns?${qs({ select: campaignSelect, id: `eq.${id}`, limit: 1 })}`, { method: "GET" });
    if (!rows[0]) throw new HttpError(404, "campaign not found");
    return json({ campaign: publicCampaign(rows[0]) });
}

export async function setCampaignStatus(request: Request, status: "paused" | "canceled"): Promise<Response> {
    const id = idParam(request);
    const patch = status === "canceled" ? { status, finished_at: new Date().toISOString() } : { status };
    return json({ campaign: publicCampaign(await patchCampaign(id, patch)) });
}

export async function retryFailed(request: Request): Promise<Response> {
    const id = idParam(request);
    const response = await rest(`campaign_recipients?${qs({ campaign_id: `eq.${id}`, status: "eq.failed" })}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ status: "pending", next_attempt_at: new Date().toISOString(), last_error: null }),
    });
    if (!response.ok) throw await restError(response);
    const retried = (await response.json() as unknown[]).length;
    const rows = await restJson<CampaignRow[]>(`campaigns?${qs({ select: campaignSelect, id: `eq.${id}`, limit: 1 })}`, { method: "GET" });
    if (rows[0] && retried) await patchCampaign(id, { failed_count: Math.max(0, rows[0].failed_count - retried) });
    return json({ campaignId: id, retried });
}

export async function patchCampaign(id: string, values: JsonRecord): Promise<CampaignRow> {
    return firstRow<CampaignRow>(`campaigns?${qs({ id: `eq.${id}`, select: campaignSelect })}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify(values),
    });
}

export function publicCampaign(row: CampaignRow): JsonRecord {
    return {
        id: row.id,
        status: row.status,
        templateKey: row.template_key,
        sharedData: row.shared_data,
        ratePerMinute: row.rate_per_minute,
        scheduledAt: row.scheduled_at ?? "",
        startedAt: row.started_at ?? "",
        finishedAt: row.finished_at ?? "",
        totalCount: row.total_count,
        sentCount: row.sent_count,
        failedCount: row.failed_count,
        skippedCount: row.skipped_count,
        createdAt: row.created_at ?? "",
        updatedAt: row.updated_at ?? "",
    };
}
