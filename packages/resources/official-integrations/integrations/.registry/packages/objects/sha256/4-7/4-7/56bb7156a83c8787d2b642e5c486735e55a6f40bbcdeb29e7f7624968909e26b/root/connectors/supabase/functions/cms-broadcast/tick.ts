import { optionalIntEnv, requiredEnv, upstreamBase } from "./env.ts";
import { json, isRecord } from "./http.ts";
import { firstRow, qs, rest, restError, restJson } from "./rest.ts";
import { patchCampaign } from "./campaigns.ts";
import type { CampaignRow, JsonRecord, RecipientRow } from "./types.ts";

const campaignSelect =
    "id,status,template_key,shared_data,rate_per_minute,total_count,sent_count,failed_count,skipped_count";
const recipientSelect = "id,campaign_id,email,data,status,attempts,next_attempt_at,last_error,message_id";

export async function tick(): Promise<Response> {
    await activateScheduledCampaigns();
    const campaigns = await restJson<CampaignRow[]>(
        `campaigns?${qs({
            select: campaignSelect,
            status: "eq.running",
            order: "created_at.asc",
            limit: optionalIntEnv("BROADCAST_TICK_CAMPAIGNS", 3),
        })}`,
        { method: "GET" },
    );
    const results = [];
    for (const campaign of campaigns) {
        results.push(await tickCampaign(campaign));
    }
    return json({ campaigns: results });
}

async function activateScheduledCampaigns(): Promise<void> {
    const now = new Date().toISOString();
    const response = await rest(`campaigns?${qs({ status: "eq.scheduled", scheduled_at: `lte.${now}` })}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ status: "running", started_at: now }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
}

async function tickCampaign(campaign: CampaignRow): Promise<JsonRecord> {
    const limit = Math.min(campaign.rate_per_minute, optionalIntEnv("BROADCAST_TICK_BATCH", 25));
    const recipients = await pendingRecipients(campaign.id, limit);
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
        const claimed = await claimRecipient(recipient);
        if (!claimed) {
            continue;
        }
        const result = await sendRecipient(campaign, claimed);
        if (result === "sent") {
            sent++;
        }
        if (result === "failed") {
            failed++;
        }
    }
    const next = await patchCampaign(campaign.id, {
        sent_count: campaign.sent_count + sent,
        failed_count: campaign.failed_count + failed,
    });
    const remaining = await hasPendingRecipients(campaign.id);
    if (!remaining && next.sent_count + next.failed_count + next.skipped_count >= next.total_count) {
        await patchCampaign(campaign.id, { status: "done", finished_at: new Date().toISOString() });
    }
    return { id: campaign.id, claimed: recipients.length, sent, failed };
}

async function pendingRecipients(campaignId: string, limit: number): Promise<RecipientRow[]> {
    return restJson<RecipientRow[]>(
        `campaign_recipients?${qs({
            select: recipientSelect,
            campaign_id: `eq.${campaignId}`,
            status: "eq.pending",
            next_attempt_at: `lte.${new Date().toISOString()}`,
            order: "next_attempt_at.asc",
            limit,
        })}`,
        { method: "GET" },
    );
}

async function claimRecipient(row: RecipientRow): Promise<RecipientRow | null> {
    const response = await rest(
        `campaign_recipients?${qs({ id: `eq.${row.id}`, status: "eq.pending", select: recipientSelect })}`,
        {
            method: "PATCH",
            headers: { "content-type": "application/json", prefer: "return=representation" },
            body: JSON.stringify({ status: "sending" }),
        },
    );
    if (!response.ok) {
        throw await restError(response);
    }
    return ((await response.json()) as RecipientRow[])[0] ?? null;
}

async function sendRecipient(campaign: CampaignRow, recipient: RecipientRow): Promise<"sent" | "failed" | "retry"> {
    const response = await fetch(`${upstreamBase("cms-emailer")}/template/send`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${requiredEnv("CMS_EMAILER_API_KEY")}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            key: campaign.template_key,
            toEmails: [recipient.email],
            data: mergeData(campaign.shared_data, recipient.data, recipient.email),
            idempotencyKey: `${campaign.id}:${recipient.email}`,
        }),
    });
    if (response.ok) {
        const body = await response.json().catch(() => ({}));
        await updateRecipient(recipient.id, {
            status: "sent",
            sent_at: new Date().toISOString(),
            message_id: messageId(body),
            last_error: null,
        });
        return "sent";
    }
    return await handleSendFailure(recipient, response);
}

async function handleSendFailure(recipient: RecipientRow, response: Response): Promise<"failed" | "retry"> {
    const attempts = recipient.attempts + 1;
    const error = await response.text().catch(() => `Emailer failed (${response.status})`);
    const terminal = response.status >= 400 && response.status < 500 && response.status !== 429;
    if (terminal || attempts >= optionalIntEnv("BROADCAST_MAX_ATTEMPTS", 5)) {
        await updateRecipient(recipient.id, { status: "failed", attempts, last_error: error.slice(0, 1000) });
        return "failed";
    }
    await updateRecipient(recipient.id, {
        status: "pending",
        attempts,
        next_attempt_at: new Date(Date.now() + attempts * attempts * 60000).toISOString(),
        last_error: error.slice(0, 1000),
    });
    return "retry";
}

async function updateRecipient(id: string, values: JsonRecord): Promise<RecipientRow> {
    return firstRow<RecipientRow>(`campaign_recipients?${qs({ id: `eq.${id}`, select: recipientSelect })}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify(values),
    });
}

async function hasPendingRecipients(campaignId: string): Promise<boolean> {
    const rows = await restJson<RecipientRow[]>(
        `campaign_recipients?${qs({
            select: "id",
            campaign_id: `eq.${campaignId}`,
            status: "in.(pending,sending)",
            limit: 1,
        })}`,
        { method: "GET" },
    );
    return rows.length > 0;
}

function mergeData(shared: JsonRecord, recipientData: JsonRecord, email: string): JsonRecord {
    const sharedSubscriber = isRecord(shared.subscriber) ? shared.subscriber : {};
    const rowSubscriber = isRecord(recipientData.subscriber) ? recipientData.subscriber : {};
    return { ...shared, ...recipientData, subscriber: { ...sharedSubscriber, ...rowSubscriber, email } };
}

function messageId(value: unknown): string | null {
    if (!isRecord(value)) {
        return null;
    }
    const id = value.id ?? value.messageId ?? value.providerMessageId;
    return typeof id === "string" ? id : null;
}
