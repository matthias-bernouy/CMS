import { expect, test } from "bun:test";
import { welcomeTemplate } from "../../fixtures/templates";
import { createHarness } from "../../harness/create";
import { sourceJson } from "../../harness/requests";
import { okJson } from "../../harness/responses";

export function registerDeliveryEscapingTest(): void {
    test("escapes dynamic values in HTML while preserving subject and text content", async () => {
        const harness = await createHarness();
        await okJson(await sourceJson(harness, "upsertTemplate", welcomeTemplate()));

        const rendered = await okJson(
            await sourceJson(harness, "renderTemplate", {
                key: "auth.welcome",
                data: { user: { name: `<Example & "Company">'` } },
            }),
        );

        expect(rendered).toMatchObject({
            subject: `Welcome <Example & "Company">'`,
            htmlBody: "<p>Hello &lt;Example &amp; &quot;Company&quot;&gt;&#39;</p>",
            textBody: `Hello <Example & "Company">'`,
        });
    });
}
