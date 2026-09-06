import { expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import getSettings from "cms-control/api/_platform/integrations/management/settings.get";
import getHealth from "cms-control/api/_platform/integrations/management/health.get";
import { integrationManagement } from "cms-control/core/management/integrations/installationActions/management/service";
import { runtimeFixture } from "./runtimeFixture";

test("management GET routes carry the verified admin through the registered function and computed Source headers", async () => {
    const { cms, environment, load, run } = await runtimeFixture();
    const newsletter = await load("newsletter", "domains");
    await run("create", newsletter.definition, newsletter.root);
    const emailer = await load("emailer", "providers");
    await run("create", emailer.definition, emailer.root);
    const source = await cms.sources.getSource("urn:emailer");
    const endpoint = source.endpoints.find((item: { urn: string }) => item.urn === "urn:emailer:manageSource");
    endpoint.headers.push(
        { name: "x-cms-user-id", source: { from: "computed", ref: "userID" } },
        { name: "x-cms-user-role", source: { from: "computed", ref: "userRole" } },
    );
    await cms.sources.updateSource(source);
    cms.auth = new InMemoryAuthentication({ identifier: "verified-admin", role: "admin" });
    const operations: string[] = [];
    cms.sourceExecutorDeps.fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(request.headers.get("authorization")).toBe(`Bearer ${environment.CMS_EMAILER_API_KEY}`);
        expect(request.headers.get("x-cms-user-id")).toBe("verified-admin");
        expect(request.headers.get("x-cms-user-role")).toBe("admin");
        const payload = await request.json();
        expect(payload.actor).toEqual({ id: "verified-admin", role: "admin" });
        operations.push(payload.operation);
        return Response.json(
            payload.operation === "health"
                ? {
                      schemaVersion: 1,
                      status: "ready",
                      checkedAt: new Date().toISOString(),
                      configuration: { savedRevision: "1", appliedRevision: "1" },
                      checks: [],
                  }
                : { values: { configured: true }, savedRevision: "1", appliedRevision: "1" },
        );
    };
    const request = (endpoint: string) =>
        new Request(`https://control.test/api/integrations/management/${endpoint}?id=emailer&actor=forged`, {
            headers: { "x-cms-user-id": "forged", "x-cms-user-role": "user" },
        });
    expect(await (await getSettings(request("settings"), cms)).json()).toMatchObject({ values: { configured: true } });
    expect(await (await getHealth(request("health"), cms)).json()).toMatchObject({
        observation: "valid",
        report: { status: "ready" },
    });
    expect(operations).toEqual(["read-settings", "health"]);
});

test("official ordinary connector install saves and applies settings, then preserves runtime values across deployments", async () => {
    const { cms, secrets, installations, environment, runtime, phases, load, run } = await runtimeFixture();
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
    expect(environment[runtime.passwordName]).toBe("selected-smtp-password");
    expect(environment.CMS_EMAILER_API_KEY).toBe(authKey);
    expect((await installations.get("emailer"))?.managementSecretRefs).toEqual({
        smtpPassword: "${SELECTED_SMTP_PASSWORD}",
    });
    expect(await integrationManagement(cms).settings("emailer")).toMatchObject({ values, appliedRevision: "saved-1" });
});

test("existing ordinary installations recover their runtime destination from successful deployment history", async () => {
    const { cms, installations, secrets, load, run, environment, runtime } = await runtimeFixture();
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
    expect(environment[runtime.passwordName]).toBe("selected-smtp-password");
});
