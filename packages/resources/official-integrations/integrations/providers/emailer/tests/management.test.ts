import { expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { createSourceManagement } from "../connectors/supabase/functions/cms-emailer/management.ts";

test("Emailer verifies credentials without persisting values and confirms after sync", async () => {
    const row: Record<string, unknown> = {
        id: "default",
        saved_revision: null,
        applied_revision: null,
        operation: "idle",
    };
    let verified = 0;
    const handler = createSourceManagement({
        authenticate: () => {},
        read: async () => ({ ...row }),
        values: (current) => ({ smtpPassword: current?.smtp_password }),
        patch: (input) => ({
            smtp_password: input.smtpPassword,
            smtp_host: "smtp.test",
            smtp_port: 587,
            smtp_user: "test",
            default_from: "test@example.test",
        }),
        rest: async (_path, init) => {
            Object.assign(row, JSON.parse(String(init.body)));
            return Response.json([row]);
        },
        verify: async (_settings, password) => {
            expect(password).toBe("scoped-password");
            verified += 1;
        },
        fail: (_status, message): never => {
            throw new Error(message);
        },
    });
    const call = (operation: string, input = {}) =>
        handler(
            new Request("https://local.test/manage", {
                method: "POST",
                body: JSON.stringify({ operation, input, secretValues: { smtpPassword: "scoped-password" } }),
            }),
        );
    const saved = await (
        await call("save-settings", { expectedRevision: null, values: { smtpPassword: "${SMTP}" } })
    ).json();
    expect(saved.appliedRevision).toBeNull();
    const applied = await (await call("apply-settings")).json();
    expect(verified).toBe(1);
    expect(applied.appliedRevision).toBeNull();
    expect(JSON.stringify(row)).not.toContain("scoped-password");
    const confirmed = await (await call("confirm-apply", { savedRevision: saved.savedRevision })).json();
    expect(confirmed.appliedRevision).toBe(saved.savedRevision);
    expect((await (await call("health")).json()).status).toBe("ready");
});

test.each([
    { user: "", passwordRef: "", password: "", allowed: true },
    { user: "sender", passwordRef: "", password: "", allowed: false },
    { user: "", passwordRef: "${SMTP}", password: "scoped-password", allowed: false },
    { user: "", passwordRef: "${MISSING}", password: "", allowed: false },
])("Emailer validates optional SMTP authentication: %j", async ({ user, passwordRef, password, allowed }) => {
    const row: Record<string, unknown> = {
        id: "default",
        saved_revision: null,
        applied_revision: null,
        operation: "idle",
    };
    let verified = 0;
    const handler = createSourceManagement({
        authenticate: () => {},
        read: async () => ({ ...row }),
        values: (current) => current ?? {},
        patch: () => ({
            smtp_host: "inbucket",
            smtp_port: 1025,
            smtp_secure: false,
            smtp_user: user,
            smtp_password: passwordRef,
            default_from: "sender@example.test",
        }),
        rest: async (_path, init) => {
            Object.assign(row, JSON.parse(String(init.body)));
            return Response.json([row]);
        },
        verify: async (settings, actualPassword) => {
            expect(settings.smtp_host).toBe("inbucket");
            expect(settings.smtp_port).toBe(1025);
            expect(actualPassword).toBe("");
            verified += 1;
        },
        fail: (status, message): never => {
            throw new Error(`${status}: ${message}`);
        },
    });
    const call = (operation: string, input = {}) =>
        handler(
            new Request("https://local.test/manage", {
                method: "POST",
                body: JSON.stringify({ operation, input, secretValues: { smtpPassword: password } }),
            }),
        );
    const saved = await (await call("save-settings", { expectedRevision: null, values: {} })).json();
    expect(saved.savedRevision).toBeString();
    if (!allowed) {
        await expect(call("apply-settings")).rejects.toThrow("422:");
        expect(verified).toBe(0);
        return;
    }
    await call("apply-settings");
    await call("confirm-apply", { savedRevision: saved.savedRevision });
    const health = await (await call("health")).json();
    expect(health.status).toBe("ready");
    expect(health.checks[0].code).toBe("smtp_connected");
    expect(verified).toBe(2);
});

test("Emailer Connection fields allow anonymous SMTP configuration", async () => {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("emailer");
    const fields = definition?.management?.settings?.fields ?? [];
    const username = fields.find((field) => field.id === "smtpUser");
    const password = fields.find((field) => field.id === "smtpPassword");
    expect(username).toMatchObject({ type: "text", path: "smtpUser" });
    expect(username?.required).not.toBe(true);
    expect(password).toMatchObject({ type: "secret-ref", path: "smtpPassword" });
    expect(password?.required).not.toBe(true);
});
