import type { SourceEndpoint } from "@bernouy/cms-sources";
import { asRecord, dispatchResult, parseNotification, safeError } from "./dispatchValues";
import { callJson, installedEndpoint } from "./sourceCalls";
import { provisionTemplates } from "./templateProvisioning";
import type { ClaimedNotification, NotificationDispatchOptions, NotificationDispatchResult } from "./types";

export async function dispatchNotificationsOnce(
    options: NotificationDispatchOptions,
    runId = options.randomUUID?.() ?? crypto.randomUUID(),
): Promise<NotificationDispatchResult> {
    const now = options.now ?? (() => new Date());
    const startedAt = now().getTime();
    const workerId = options.workerId ?? "notification-dispatcher";
    const endpoints = await resolveEndpoints(options);
    if (!endpoints) {
        return dispatchResult(workerId, runId, "missing", 0, 0, 0, startedAt, now);
    }
    try {
        const claimed = await claim(options, endpoints.claim, `${workerId}:${runId}`);
        if (claimed.length > 0) {
            await provisionTemplates(options, endpoints.templates, endpoints.install);
        }
        let sent = 0;
        let failed = 0;
        for (const notification of claimed) {
            const delivered = await deliver(options, endpoints, notification, `${workerId}:${runId}`);
            if (delivered) {
                sent += 1;
            } else {
                failed += 1;
            }
        }
        return dispatchResult(workerId, runId, "succeeded", claimed.length, sent, failed, startedAt, now);
    } catch (error) {
        options.logger?.error(`[cms-notifications] ${safeError(error)}`);
        return dispatchResult(workerId, runId, "failed", 0, 0, 1, startedAt, now);
    }
}

async function resolveEndpoints(options: NotificationDispatchOptions) {
    const [claim, complete, fail, templates, install, send] = await Promise.all([
        installedEndpoint(options.installations, options.sources, options.notificationKind, "claimNotifications"),
        installedEndpoint(options.installations, options.sources, options.notificationKind, "completeNotification"),
        installedEndpoint(options.installations, options.sources, options.notificationKind, "failNotification"),
        installedEndpoint(
            options.installations,
            options.sources,
            options.notificationKind,
            "listDefaultNotificationTemplates",
        ),
        installedEndpoint(options.installations, options.sources, options.emailerKind, "installTemplates"),
        installedEndpoint(options.installations, options.sources, options.emailerKind, "sendTemplateEmail"),
    ]);
    return claim && complete && fail && templates && install && send
        ? { claim, complete, fail, templates, install, send }
        : null;
}

async function claim(
    options: NotificationDispatchOptions,
    endpoint: SourceEndpoint,
    runKey: string,
): Promise<ClaimedNotification[]> {
    const payload = await callJson(
        endpoint,
        { runKey, limit: options.limit ?? 10, consumerMode: "builtin" },
        options.deps,
    );
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map(parseNotification);
}

async function deliver(
    options: NotificationDispatchOptions,
    endpoints: { complete: SourceEndpoint; fail: SourceEndpoint; send: SourceEndpoint },
    notification: ClaimedNotification,
    runKey: string,
): Promise<boolean> {
    if (notification.context.contractVersion !== 1) {
        await recordFailure(
            options,
            endpoints.fail,
            notification,
            runKey,
            `Unsupported notification contract version: ${String(notification.context.contractVersion)}`,
            false,
        );
        return false;
    }
    const user = await options.users.getBySub(notification.recipientCmsUserId);
    if (!user?.email) {
        await recordFailure(options, endpoints.fail, notification, runKey, "CMS user email is unavailable", false);
        return false;
    }
    try {
        const recipient = asRecord(notification.context.recipient);
        const message = await callJson(
            endpoints.send,
            {
                key: notification.templateKey,
                toEmails: [user.email],
                data: {
                    ...notification.context,
                    recipient: { ...recipient, userId: notification.recipientCmsUserId, email: user.email },
                },
                idempotencyKey: notification.idempotencyKey,
            },
            options.deps,
        );
        await callJson(
            endpoints.complete,
            {
                deliveryId: notification.deliveryId,
                runKey,
                messageId: typeof message.id === "string" ? message.id : null,
            },
            options.deps,
        );
        return true;
    } catch (error) {
        await recordFailure(options, endpoints.fail, notification, runKey, safeError(error), true);
        return false;
    }
}

async function recordFailure(
    options: NotificationDispatchOptions,
    endpoint: SourceEndpoint,
    notification: ClaimedNotification,
    runKey: string,
    error: string,
    retryable: boolean,
): Promise<void> {
    await callJson(
        endpoint,
        { deliveryId: notification.deliveryId, runKey, error: error.slice(0, 1000), retryable },
        options.deps,
    );
}
