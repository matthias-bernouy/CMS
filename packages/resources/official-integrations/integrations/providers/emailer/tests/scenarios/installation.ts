import { expect, test } from "bun:test";
import { validateSource } from "@bernouy/cms-sources";
import { createHarness } from "../harness/create";

export function registerInstallationTest(): void {
    test("installs source backends, connector, and system send endpoint", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:emailer");
        const broadcastSource = await harness.sources.getSource("urn:emailer-broadcast");
        const templatesDashboard = await harness.dashboards.getDashboard("emailer-templates");
        const settingsDashboard = await harness.dashboards.getDashboard("emailer-settings");
        const campaignsDashboard = await harness.dashboards.getDashboard("emailer-broadcast-campaigns");

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(broadcastSource).toBeTruthy();
        expect(validateSource(broadcastSource!)).toEqual([]);
        expect(templatesDashboard).toBeNull();
        expect(settingsDashboard).toBeNull();
        expect(campaignsDashboard).toBeNull();
        expect(harness.deployment?.dataApiSchemas).toEqual(["emailer", "broadcast"]);
        expect(
            harness.deployment?.schemas.map((schema) => ("manifest" in schema ? schema.manifest : schema.path)),
        ).toEqual(["sql/schema.manifest.json", "sql/broadcast-schema.manifest.json"]);
        expect(harness.deployment?.functions.map((fn) => fn.name)).toEqual(["cms-emailer", "cms-broadcast"]);
        expect(String(harness.deployment?.functions[0]?.secrets?.CMS_EMAILER_API_KEY)).toStartWith("cms_em_");
        expect(harness.deployment?.functions[0]?.secrets).toMatchObject({
            SMTP_HOST: "smtp.example.test",
            SMTP_PORT: "587",
            SMTP_SECURE: "false",
            SMTP_USER: "smtp-user",
            SMTP_PASSWORD: "smtp-password",
            SMTP_FROM: "no-reply@example.test",
            SMTP_REPLY_TO: "support@example.test",
        });
        expect(harness.deployment?.functions[1]?.secrets).toMatchObject({
            CMS_EMAILER_API_KEY: expect.stringMatching(/^cms_em_/),
            CMS_BROADCAST_API_KEY: expect.stringMatching(/^cms_eb_/),
        });
        expect(harness.deployment?.functions[1]?.secrets).not.toHaveProperty("CMS_NEWSLETTER_API_KEY");
        expect(harness.result.secrets?.map((secret) => secret.key)).toEqual([
            "EMAILER_EMAILER_API_KEY",
            "EMAILER_EMAILER_BROADCAST_API_KEY",
        ]);
        for (const id of [
            "sendNewsletterBroadcast",
            "getNewsletterBroadcastStatus",
            "pauseNewsletterBroadcast",
            "cancelNewsletterBroadcast",
            "retryNewsletterBroadcastFailures",
        ]) {
            expect(await harness.functions.getFunction(id)).toBeTruthy();
        }
        expect(await harness.functions.getFunction("startNewsletterBroadcast")).toBeNull();
        expect(broadcastSource?.endpoints.some((endpoint) => endpoint.urn.endsWith(":startCampaign"))).toBe(false);
        const sendEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === "urn:emailer:sendTemplateEmail");
        const installEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === "urn:emailer:installTemplates");
        expect(sendEndpoint?.access).toEqual({ mode: "system" });
        expect(installEndpoint?.access).toEqual({ mode: "system" });
        expect(installEndpoint?.input?.body?.properties?.templates?.items?.properties).toMatchObject({
            key: { type: "string" },
            subject: { type: "string" },
            htmlBody: { type: "string" },
            metadata: { type: "object" },
        });
        const upsertEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === "urn:emailer:upsertTemplate");
        expect(upsertEndpoint?.input?.body?.properties).toMatchObject({
            textBody: { type: "string" },
            sampleDataJson: { type: "string" },
            metadata: { type: "object" },
        });
    });
}
