import { expect, test } from "bun:test";
import { dashboardViewAsLegacyDashboard, validateDashboard } from "@bernouy/cms-dashboards";
import { validateSource } from "@bernouy/cms-sources";
import { createHarness } from "../harness/create";

export function registerInstallationTest(): void {
    test("installs source backends, dashboards, connector, and system send endpoint", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:emailer");
        const broadcastSource = await harness.sources.getSource("urn:emailer-broadcast");
        const templatesView = await harness.dashboardViews.getView("emailer-templates");
        const settingsView = await harness.dashboardViews.getView("emailer-settings");
        const campaignsView = await harness.dashboardViews.getView("emailer-broadcast-campaigns");
        const templatesDashboard = templatesView ? dashboardViewAsLegacyDashboard(templatesView) : null;
        const settingsDashboard = settingsView ? dashboardViewAsLegacyDashboard(settingsView) : null;
        const campaignsDashboard = campaignsView ? dashboardViewAsLegacyDashboard(campaignsView) : null;

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(broadcastSource).toBeTruthy();
        expect(validateSource(broadcastSource!)).toEqual([]);
        expect(templatesDashboard).toBeTruthy();
        expect(settingsDashboard).toBeTruthy();
        expect(campaignsDashboard).toBeTruthy();
        expect(validateDashboard(templatesDashboard!, { source })).toEqual([]);
        expect(validateDashboard(settingsDashboard!, { source })).toEqual([]);
        expect(validateDashboard(campaignsDashboard!, { source: broadcastSource })).toEqual([]);
        const templateDetail = templatesDashboard?.views.find((view) => view.id === "templateDetail");
        const settingsDetail = settingsDashboard?.views.find((view) => view.id === "emailerSettings");
        if (templateDetail?.widget !== "w-detail" || settingsDetail?.widget !== "w-detail") {
            throw new Error("emailer details not installed");
        }
        expect(templateDetail.actions?.find((action) => action.id === "saveTemplate")?.after).toEqual({
            opens: "templateDetail",
            row: "$result.key",
            resource: "$result",
        });
        expect(templateDetail.actions?.find((action) => action.id === "archiveTemplate")?.after).toEqual({
            resource: "$result",
        });
        expect(settingsDetail.actions?.find((action) => action.id === "saveSettings")?.after).toEqual({
            resource: "$result",
        });
        const dashboardJson = JSON.stringify(templatesDashboard);
        const settingsJson = JSON.stringify(settingsDashboard);
        expect(dashboardJson).toContain("newTemplate");
        expect(dashboardJson).toContain("sendTestEmail");
        expect(dashboardJson).not.toContain("messagesTable");
        expect(dashboardJson).toContain("textBody");
        expect(dashboardJson).toContain("sampleDataJson");
        const saveTemplate = templateDetail.actions?.find((action) => action.id === "saveTemplate");
        expect(saveTemplate?.endpoint.body).toMatchObject({
            textBody: "$field.textBody",
            sampleDataJson: "$field.sampleDataJson",
            metadata: "$resource.metadata",
        });
        expect(settingsJson).toContain("emailerSettings");
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
