import { expect, test } from "bun:test";
import { welcomeTemplate } from "../../fixtures/templates";
import { createHarness } from "../../harness/create";
import { sourceJson } from "../../harness/requests";
import { jsonBody, okJson } from "../../harness/responses";
import { functionsBaseUrl } from "../../harness/runtime";

export function registerDeliveryValidationTest(): void {
    test("rejects invalid CMS keys, malformed tokens, and missing required tokens", async () => {
        const harness = await createHarness();
        const unauthorized = await harness.sourceFetch(`${functionsBaseUrl}/cms-emailer/health`, {
            headers: { authorization: "Bearer wrong" },
        });
        const malformed = await sourceJson(harness, "upsertTemplate", {
            ...welcomeTemplate(),
            subject: "Welcome {{ user-name }}",
        });
        await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));
        const missingToken = await sourceJson(harness, "sendTemplateEmail", {
            key: "auth.welcome",
            toEmails: ["buyer@example.test"],
            data: { user: {} },
        });

        expect(unauthorized.status).toBe(401);
        expect(await jsonBody(unauthorized)).toEqual({ error: "invalid CMS API key" });
        expect(malformed.status).toBe(400);
        expect(await jsonBody(malformed)).toEqual({ error: "subject contains an invalid token" });
        expect(missingToken.status).toBe(400);
        expect(await jsonBody(missingToken)).toEqual({ error: "missing required token: user.name" });
    });
}
