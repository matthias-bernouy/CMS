import { expect, test } from "bun:test";
import { welcomeTemplate } from "../../fixtures/templates";
import { createHarness } from "../../harness/create";
import { sourceJson, sourceRequest } from "../../harness/requests";
import { okJson } from "../../harness/responses";
import type { EmailTransport, JsonRecord } from "../../harness/types";

export function registerDeliveryLifecycleTest(): void {
    test("writes, renders, sends, logs, and archives templates through the installed CMS source", async () => {
        const harness = await createHarness();
        const sent: JsonRecord[] = [];
        (globalThis as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__ = {
            async sendMail(input) {
                sent.push(input);
                return { messageId: `smtp-${sent.length}` };
            },
        };

        const saved = await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));
        const created = await okJson(
            await sourceJson(harness, "upsertTemplate", {
                key: "billing.receipt",
                name: "Receipt email",
                status: "draft",
                subject: "Receipt {{ order.number }}",
                htmlBody: "<p>Receipt {{ order.number }}</p>",
                requiredTokens: [{ name: "order.number", description: "Order number", sample: "A-100" }],
            }),
        );
        const listed = await okJson(await sourceRequest(harness, "listTemplates", { q: "welcome" }));
        const fetched = await okJson(await sourceRequest(harness, "getTemplate", { key: "auth.welcome" }));
        const rendered = await okJson(
            await sourceJson(harness, "renderTemplate", {
                key: "auth.welcome",
                data: { user: { name: "Bea" } },
            }),
        );
        const testMessage = await okJson(
            await sourceJson(harness, "sendTestEmail", {
                key: "auth.welcome",
                toEmail: "TEST@Example.COM",
            }),
        );
        const createdTestMessage = await okJson(
            await sourceJson(harness, "sendTestEmail", {
                key: "billing.receipt",
                toEmail: "receipt@example.test",
            }),
        );
        const systemMessage = await okJson(
            await sourceJson(harness, "sendTemplateEmail", {
                key: "auth.welcome",
                toEmails: ["buyer@example.test"],
                data: { user: { name: "Bea" } },
                idempotencyKey: "welcome-1",
            }),
        );
        const messages = await okJson(await sourceRequest(harness, "listMessages", { status: "sent" }));
        const archived = await okJson(await sourceJson(harness, "archiveTemplate", {}, { key: "auth.welcome" }));
        const fetchedAfterArchive = await okJson(await sourceRequest(harness, "getTemplate", { key: "auth.welcome" }));

        expect(saved).toMatchObject({ key: "auth.welcome", name: "Welcome email", status: "active" });
        expect(saved).toEqual(fetched);
        expect(created).toMatchObject({ key: "billing.receipt", name: "Receipt email", status: "draft" });
        expect(listed.items).toContainEqual(expect.objectContaining({ key: "auth.welcome" }));
        expect(String(fetched.sampleDataJson)).toContain("Ada");
        expect(rendered).toMatchObject({
            key: "auth.welcome",
            subject: "Welcome Bea",
            htmlBody: "<p>Hello Bea</p>",
            textBody: "Hello Bea",
        });
        expect(testMessage).toMatchObject({ status: "sent", providerMessageId: "smtp-1" });
        expect(createdTestMessage).toMatchObject({ status: "sent", providerMessageId: "smtp-2" });
        expect(systemMessage).toMatchObject({
            status: "sent",
            providerMessageId: "smtp-3",
            idempotencyKey: "welcome-1",
        });
        expect(messages.total).toBe(3);
        expect(archived).toEqual(fetchedAfterArchive);
        expect(sent).toHaveLength(3);
        expect(sent[0]).toMatchObject({
            to: ["test@example.com"],
            subject: "Welcome Ada",
            html: "<p>Hello Ada</p>",
        });
        expect(sent[1]).toMatchObject({
            to: ["receipt@example.test"],
            subject: "Receipt A-100",
        });
        expect(sent[2]).toMatchObject({
            to: ["buyer@example.test"],
            subject: "Welcome Bea",
        });
        expect(archived).toMatchObject({ key: "auth.welcome", status: "archived" });
    });
}
