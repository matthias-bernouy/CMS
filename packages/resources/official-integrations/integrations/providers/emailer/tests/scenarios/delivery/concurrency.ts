import { expect, test } from "bun:test";
import { welcomeTemplate } from "../../fixtures/templates";
import { createHarness } from "../../harness/create";
import { sourceJson } from "../../harness/requests";
import { okJson } from "../../harness/responses";
import type { EmailTransport } from "../../harness/types";

export function registerDeliveryConcurrencyTest(): void {
    test("reserves an idempotency key before SMTP so concurrent sends cannot duplicate", async () => {
        const harness = await createHarness();
        await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));

        let releaseTransport = () => undefined;
        const transportGate = new Promise<void>((resolve) => {
            releaseTransport = resolve;
        });
        let transportStarted = () => undefined;
        const started = new Promise<void>((resolve) => {
            transportStarted = resolve;
        });
        let sends = 0;
        (globalThis as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__ = {
            async sendMail() {
                sends += 1;
                transportStarted();
                await transportGate;
                return { messageId: "smtp-concurrent" };
            },
        };

        const first = sourceJson(harness, "sendTemplateEmail", {
            key: "auth.welcome",
            toEmails: ["buyer@example.test"],
            data: { user: { name: "Bea" } },
            idempotencyKey: "same-key",
        });
        await started;
        const concurrent = await sourceJson(harness, "sendTemplateEmail", {
            key: "auth.welcome",
            toEmails: ["buyer@example.test"],
            data: { user: { name: "Bea" } },
            idempotencyKey: "same-key",
        });
        expect(concurrent.status).toBe(409);

        releaseTransport();
        const delivered = await okJson(await first);
        expect(delivered).toMatchObject({ status: "sent", idempotencyKey: "same-key" });
        expect(sends).toBe(1);
        expect(harness.rest.rows("messages")).toHaveLength(1);
    });
}
