import { expect, test } from "bun:test";
import { createHarness } from "../../harness/create";
import { sourceJson, sourceRequest } from "../../harness/requests";
import { okJson } from "../../harness/responses";

export function registerSettingsUpdatesTest(): void {
    test("updates provider SMTP settings without exposing the saved password", async () => {
        const harness = await createHarness();
        const updated = await okJson(
            await sourceJson(harness, "updateSettings", {
                smtpHost: "smtp.saved.test",
                smtpPort: "2525",
                smtpSecure: "true",
                smtpUser: "saved-user",
                smtpPassword: "saved-password",
                defaultFrom: "saved@example.test",
                defaultReplyTo: "reply@example.test",
            }),
        );
        const settingsAfterUpdate = await okJson(await sourceRequest(harness, "getSettings"));
        const afterBlankPasswordSave = await okJson(
            await sourceJson(harness, "updateSettings", {
                smtpHost: "smtp.saved.test",
                smtpPort: "2525",
                smtpSecure: "true",
                smtpUser: "saved-user",
                smtpPassword: "",
                defaultFrom: "saved@example.test",
                defaultReplyTo: "reply@example.test",
            }),
        );
        const settings = await okJson(await sourceRequest(harness, "getSettings"));

        expect(updated).toMatchObject({
            smtpHost: "smtp.saved.test",
            smtpPort: "2525",
            smtpSecure: "true",
            smtpUser: "saved-user",
            smtpPassword: "",
            smtpPasswordConfigured: "configured",
            defaultFrom: "saved@example.test",
            defaultReplyTo: "reply@example.test",
        });
        expect(updated).toEqual(settingsAfterUpdate);
        expect(afterBlankPasswordSave).toMatchObject({ smtpPassword: "", smtpPasswordConfigured: "configured" });
        expect(afterBlankPasswordSave).toEqual(settings);
        expect(settings).toMatchObject({
            smtpHost: "smtp.saved.test",
            smtpPassword: "",
            smtpPasswordConfigured: "configured",
        });
        expect(harness.rest.rows("settings")[0]).toMatchObject({
            smtp_host: "smtp.saved.test",
            smtp_port: 2525,
            smtp_secure: true,
            smtp_user: "saved-user",
            smtp_password: "saved-password",
            default_from: "saved@example.test",
            default_reply_to: "reply@example.test",
        });
    });
}
