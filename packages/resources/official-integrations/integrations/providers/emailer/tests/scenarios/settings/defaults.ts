import { expect, test } from "bun:test";
import { createHarness } from "../../harness/create";
import { sourceRequest } from "../../harness/requests";
import { okJson } from "../../harness/responses";

export function registerSettingsDefaultsTest(): void {
    test("exposes provider settings and template defaults without leaking SMTP secrets", async () => {
        const harness = await createHarness();
        const settings = await okJson(await sourceRequest(harness, "getSettings"));
        const defaults = await okJson(await sourceRequest(harness, "getTemplate", { key: "__new__" }));
        const emptyDefaults = await okJson(await sourceRequest(harness, "getTemplate", { key: "" }));

        expect(settings).toMatchObject({
            provider: "supabase",
            functionName: "cms-emailer",
            smtpHost: "smtp.example.test",
            smtpPort: "587",
            smtpSecure: "false",
            smtpUser: "smtp-user",
            smtpPasswordConfigured: "configured",
            smtpPassword: "",
            defaultFrom: "no-reply@example.test",
            defaultReplyTo: "support@example.test",
        });
        expect(defaults).toMatchObject({
            key: "__new__",
            status: "draft",
            htmlBody: "<p>Hello {{ user.name }}</p>",
            testRecipient: "",
        });
        expect(emptyDefaults).toMatchObject({ key: "__new__", status: "draft" });
    });
}
