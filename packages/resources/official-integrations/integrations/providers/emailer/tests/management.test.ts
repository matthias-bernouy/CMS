import { expect, test } from "bun:test";
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
