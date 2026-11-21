import { expect, test } from "bun:test";
import {
    AccountEmailTemplates,
    MemoryAccountEmailConfigurationStore,
    accountTemplateSeeds,
} from "@bernouy/auth/email-templates";
import { httpFixture } from "./http.fixture";
import { initializeAccountTemplates } from "../../../src/runtime/authentication/templates/initialize";

test("account templates render through a separate signed HTTP Provider and refuse revoked machine authority", async () => {
    const f = await httpFixture();
    try {
        const store = new MemoryAccountEmailConfigurationStore();
        await initializeAccountTemplates(store, f.templates, await f.client.source(), () => {});
        const composer = new AccountEmailTemplates(store, f.client);
        const rendered = await composer.compose({
            kind: "password_reset",
            to: { email: "visitor@example.com" },
            actionUrl: "https://site.test/reset?token=private",
            token: "not-forwarded",
            expiresAt: new Date("2026-12-01T12:00:00.000Z"),
            siteName: "Site",
        });
        expect(rendered.subject).toBe("Reset your password for Site");
        expect(rendered.text).toContain("https://site.test/reset?token=private");
        expect(f.calls()).toBe(2);
        f.revoke();
        await expect(
            composer.compose({
                kind: "email_verification",
                to: { email: "visitor@example.com" },
                actionUrl: "https://site.test/verify",
                token: "not-forwarded",
                expiresAt: new Date(),
                siteName: "Site",
            }),
        ).rejects.toThrow();
        expect(f.calls()).toBe(2);
        expect((await f.templates.get({ id: accountTemplateSeeds[0]!.id })).latestVersion).toBe(1);
    } finally {
        f.close();
    }
});
