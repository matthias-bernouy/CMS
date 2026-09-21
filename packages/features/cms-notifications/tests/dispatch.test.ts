import { describe, expect, test } from "bun:test";
import { dispatchNotificationsOnce } from "../src/exports/index";
import { createHarness } from "./dispatchHarness";

describe("notification dispatch", () => {
    test("resolves the current CMS email, sends through Emailer, and completes the lease", async () => {
        const harness = await createHarness("buyer@example.com");

        const result = await dispatchNotificationsOnce({
            ...harness.options,
            randomUUID: () => "run-1",
        });

        expect(result).toMatchObject({ status: "succeeded", claimed: 1, sent: 1, failed: 0 });
        expect(harness.sent).toEqual([
            {
                key: "commerce.order.paid",
                toEmails: ["buyer@example.com"],
                data: {
                    contractVersion: 1,
                    recipient: { userId: "buyer-1", email: "buyer@example.com" },
                    order: { number: "ORD-1" },
                },
                idempotencyKey: "commerce-notification:delivery-1",
            },
        ]);
        expect(harness.completed).toEqual([
            {
                deliveryId: "delivery-1",
                runKey: "notification-dispatcher:run-1",
                messageId: "message-1",
            },
        ]);
        expect(harness.installedTemplates).toHaveLength(1);
    });

    test("dead-letters a missing CMS email without calling Emailer", async () => {
        const harness = await createHarness(undefined);

        const result = await dispatchNotificationsOnce({
            ...harness.options,
            randomUUID: () => "run-2",
        });

        expect(result).toMatchObject({ status: "succeeded", claimed: 1, sent: 0, failed: 1 });
        expect(harness.sent).toEqual([]);
        expect(harness.failed).toEqual([
            expect.objectContaining({
                deliveryId: "delivery-1",
                retryable: false,
                error: "CMS user email is unavailable",
            }),
        ]);
    });

    test("dead-letters unsupported template contracts instead of silently sending them", async () => {
        const harness = await createHarness("buyer@example.com", 2);

        const result = await dispatchNotificationsOnce({
            ...harness.options,
            randomUUID: () => "run-3",
        });

        expect(result).toMatchObject({ status: "succeeded", claimed: 1, sent: 0, failed: 1 });
        expect(harness.sent).toEqual([]);
        expect(harness.failed).toEqual([
            expect.objectContaining({
                deliveryId: "delivery-1",
                retryable: false,
                error: "Unsupported notification contract version: 2",
            }),
        ]);
    });

    test("does not provision Emailer when Commerce has no built-in work", async () => {
        const harness = await createHarness("buyer@example.com", 1, false);

        const result = await dispatchNotificationsOnce({
            ...harness.options,
            randomUUID: () => "run-4",
        });

        expect(result).toMatchObject({ status: "succeeded", claimed: 0, sent: 0, failed: 0 });
        expect(harness.installedTemplates).toEqual([]);
        expect(harness.sent).toEqual([]);
    });
});
