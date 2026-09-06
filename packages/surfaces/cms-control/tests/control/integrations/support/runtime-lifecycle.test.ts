import { expect, test } from "bun:test";
import { integrationManagement } from "cms-control/core/management/integrations/installationActions/management/service";
import { runtimeFixture } from "./runtimeFixture";

test("official ordinary connector install saves and applies settings, then preserves runtime values across deployments", async () => {
    const { cms, secrets, installations, environment, phases, load, run } = await runtimeFixture();
    const newsletter = await load("newsletter", "domains");
    await run("create", newsletter.definition, newsletter.root);
    const emailer = await load("emailer", "providers");
    const created = await run("create", emailer.definition, emailer.root);
    expect(created.installation.connectorBindings).toBeUndefined();
    expect(created.installation.connectorRuntimeTargets).toEqual([
        { provider: "supabase", outputs: { functionsBaseUrl: "https://project-one.supabase.co/functions/v1" } },
    ]);
    const authKey = environment.CMS_EMAILER_API_KEY;
    await secrets.set("SELECTED_SMTP_PASSWORD", "selected-smtp-password");
    const values = {
        smtpHost: "smtp.example.test",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "mailer",
        smtpPassword: "${SELECTED_SMTP_PASSWORD}",
        defaultFrom: "mail@example.test",
        defaultReplyTo: "",
    };
    const result = await integrationManagement(cms).saveSettings("emailer", { values, expectedRevision: null });
    expect(result).toMatchObject({ values, savedRevision: "saved-1", appliedRevision: "saved-1" });
    expect(phases).toEqual(["save-settings", "apply-settings", "sync", "confirm-apply"]);
    expect(JSON.stringify(result)).not.toContain("selected-smtp-password");
    await run("rerun", emailer.definition, emailer.root);
    await run("upgrade", { ...emailer.definition, version: "1.1.0" }, emailer.root);
    // A different integration also receives provider bootstrap secrets in the same project.
    await run("rerun", newsletter.definition, newsletter.root);
    expect(environment.SMTP_PASSWORD).toBe("selected-smtp-password");
    expect(environment.CMS_EMAILER_API_KEY).toBe(authKey);
    expect((await installations.get("emailer"))?.managementSecretRefs).toEqual({
        smtpPassword: "${SELECTED_SMTP_PASSWORD}",
    });
    expect(await integrationManagement(cms).settings("emailer")).toMatchObject({ values, appliedRevision: "saved-1" });
});

test("existing ordinary installations recover their runtime destination from successful deployment history", async () => {
    const { cms, installations, secrets, load, run, environment } = await runtimeFixture();
    const newsletter = await load("newsletter", "domains");
    await run("create", newsletter.definition, newsletter.root);
    const emailer = await load("emailer", "providers");
    await run("create", emailer.definition, emailer.root);
    const current = (await installations.get("emailer"))!;
    const { connectorRuntimeTargets: _targets, ...legacy } = current;
    await installations.replace(legacy);
    await secrets.set("SELECTED_SMTP_PASSWORD", "selected-smtp-password");
    await integrationManagement(cms).saveSettings("emailer", {
        values: { smtpPassword: "${SELECTED_SMTP_PASSWORD}" },
        expectedRevision: null,
    });
    expect(environment.SMTP_PASSWORD).toBe("selected-smtp-password");
});
