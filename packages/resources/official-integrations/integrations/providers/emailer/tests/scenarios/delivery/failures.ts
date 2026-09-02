import { expect, test } from "bun:test";
import { welcomeTemplate } from "../../fixtures/templates";
import { createHarness } from "../../harness/create";
import { sourceJson, sourceRequest } from "../../harness/requests";
import { jsonBody, okJson } from "../../harness/responses";
import type { EmailTransport } from "../../harness/types";

export function registerDeliveryFailuresTest(): void {
    test("records failed messages when SMTP delivery fails", async () => {
        const harness = await createHarness();
        await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));
        (globalThis as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__ = {
            async sendMail() {
                throw new Error("smtp offline");
            },
        };

        const failed = await sourceJson(harness, "sendTestEmail", {
            key: "auth.welcome",
            toEmail: "test@example.test",
        });
        const messages = await okJson(await sourceRequest(harness, "listMessages", { status: "failed" }));

        expect(failed.status).toBe(502);
        const failure = await jsonBody(failed);
        expect(failure).toEqual({ error: "email delivery failed" });
        expect(JSON.stringify(failure)).not.toContain("smtp offline");
        expect(messages.items).toEqual([expect.objectContaining({ status: "failed", error: "smtp offline" })]);
        expect(harness.rest.rows("messages")).toEqual([
            expect.objectContaining({ status: "failed", error: "smtp offline" }),
        ]);
    });
}
