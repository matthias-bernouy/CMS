import { describe, expect, test } from "bun:test";
import { registerDeliveryTests } from "./scenarios/delivery";
import { registerInstallationTest } from "./scenarios/installation";
import { registerSettingsTests } from "./scenarios/settings";

describe("emailer 1.0.0 source", () => {
    registerInstallationTest();
    test("does not deploy or retain Newsletter credentials in the broadcast connector", async () => {
        const definition = await Bun.file(
            new URL("../../integrations/emailer/versions/1.0.0/definition.json", import.meta.url),
        ).text();
        const campaignSource = await Bun.file(
            new URL(
                "../../integrations/emailer/versions/1.0.0/connectors/supabase/functions/cms-broadcast/campaigns.ts",
                import.meta.url,
            ),
        ).text();
        const entrypoint = await Bun.file(
            new URL(
                "../../integrations/emailer/versions/1.0.0/connectors/supabase/functions/cms-broadcast/index.ts",
                import.meta.url,
            ),
        ).text();

        expect(definition).not.toMatch(/dependencies\.newsletter\.(?:connectorSecrets|secrets)/);
        expect(definition).not.toContain("CMS_NEWSLETTER_API_KEY");
        expect(campaignSource).not.toContain("CMS_NEWSLETTER_API_KEY");
        expect(entrypoint).not.toContain("startCampaign");
    });
    registerSettingsTests();
    registerDeliveryTests();
});
