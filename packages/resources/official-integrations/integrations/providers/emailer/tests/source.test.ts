import { describe, expect, test } from "bun:test";
import { loadIntegrationDefinition } from "../../../../tests/helpers/integrationDefinition";
import { loadSupabaseSchemaSql } from "../../../../tests/helpers/supabaseSql";
import { registerDeliveryTests } from "./scenarios/delivery";
import { registerInstallationTest } from "./scenarios/installation";
import { registerSettingsTests } from "./scenarios/settings";

describe("emailer 1.0.0 source", () => {
    registerInstallationTest();
    test("seeds settings safely during an idempotent forced-RLS reinstall", async () => {
        const root = new URL("..", import.meta.url);
        const schema = await loadSupabaseSchemaSql(root.pathname, "sql/schema.manifest.json");
        const releaseForce = schema.indexOf("alter table emailer.settings no force row level security");
        const seed = schema.indexOf("insert into emailer.settings (id)");
        const restoreForce = schema.indexOf("alter table emailer.settings force row level security");

        expect(releaseForce).toBeGreaterThanOrEqual(0);
        expect(seed).toBeGreaterThan(releaseForce);
        expect(restoreForce).toBeGreaterThan(seed);
    });
    test("does not deploy or retain Newsletter credentials in the broadcast connector", async () => {
        const definition = JSON.stringify(
            await loadIntegrationDefinition(new URL("../definition.json", import.meta.url)),
        );
        const campaignSource = await Bun.file(
            new URL("../connectors/supabase/functions/cms-broadcast/campaigns.ts", import.meta.url),
        ).text();
        const entrypoint = await Bun.file(
            new URL("../connectors/supabase/functions/cms-broadcast/index.ts", import.meta.url),
        ).text();

        expect(definition).not.toMatch(/dependencies\.newsletter\.(?:connectorSecrets|secrets)/);
        expect(definition).not.toContain("CMS_NEWSLETTER_API_KEY");
        expect(campaignSource).not.toContain("CMS_NEWSLETTER_API_KEY");
        expect(entrypoint).not.toContain("startCampaign");
    });
    registerSettingsTests();
    registerDeliveryTests();
});
