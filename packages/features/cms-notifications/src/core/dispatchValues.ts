import type { ClaimedNotification, NotificationDispatchResult } from "./types";

export function parseNotification(value: unknown): ClaimedNotification {
    const item = asRecord(value);
    const deliveryId = requiredString(item.deliveryId, "deliveryId");
    return {
        deliveryId,
        recipientCmsUserId: requiredString(item.recipientCmsUserId, "recipientCmsUserId"),
        templateKey: requiredString(item.templateKey, "templateKey"),
        idempotencyKey: requiredString(item.idempotencyKey, "idempotencyKey"),
        context: asRecord(item.context),
    };
}

export function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function safeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function dispatchResult(
    workerId: string,
    runId: string,
    status: NotificationDispatchResult["status"],
    claimed: number,
    sent: number,
    failed: number,
    startedAt: number,
    now: () => Date,
): NotificationDispatchResult {
    return { workerId, runId, status, claimed, sent, failed, durationMs: Math.max(0, now().getTime() - startedAt) };
}

function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`claimed notification is missing ${name}`);
    }
    return value;
}
