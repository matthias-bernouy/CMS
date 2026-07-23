import type { ScheduledTriggerTaskHandler } from "@bernouy/cms-triggers";
import { dispatchNotificationsOnce } from "./dispatch";
import type { NotificationDispatchOptions } from "./types";

export const NOTIFICATION_SCHEDULED_TASK_ID = "cms.notifications.dispatch";

export function createNotificationScheduledTask(
    options: Pick<NotificationDispatchOptions, "users" | "installations" | "sources" | "deps" | "logger">,
): ScheduledTriggerTaskHandler {
    return async (input, context) => {
        const body = record(input);
        const limit = integer(body.limit, 10);
        const notificationKind = string(body.notificationKind);
        const emailerKind = string(body.emailerKind);
        if (!notificationKind || !emailerKind) {
            return Response.json(
                { error: "notificationKind and emailerKind are required scheduled task inputs" },
                { status: 400 },
            );
        }
        if (limit < 1 || limit > 50) {
            return Response.json({ error: "notification limit must be between 1 and 50" }, { status: 400 });
        }
        const result = await dispatchNotificationsOnce(
            {
                ...options,
                workerId: context.triggerId,
                notificationKind,
                emailerKind,
                limit,
            },
            context.runId,
        );
        if (result.status === "missing") {
            return Response.json(
                { error: "notification integration endpoints are unavailable", result },
                { status: 424 },
            );
        }
        if (result.status === "failed") {
            return Response.json({ error: "notification dispatch failed", result }, { status: 502 });
        }
        return Response.json(result);
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function integer(value: unknown, fallback: number): number {
    return Number.isSafeInteger(value) ? (value as number) : fallback;
}

function string(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
