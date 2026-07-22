import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsRepository } from "cms-cli/dev-server/repo/LocalFsCmsRepository";

describe("LocalFsCmsRepository system settings", () => {
    test("persists runtime email settings in system.json", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
        const repository = new LocalFsCmsRepository(siteDir, new Map());

        await repository.updateSystem({
            email: {
                enabled: true,
                fromEmail: "no-reply@example.com",
                fromName: "CMS",
                replyTo: "support@example.com",
                transport: "smtp",
                smtp: {
                    host: "smtp.example.com",
                    port: 587,
                    secure: false,
                    username: "postmaster@example.com",
                    passwordSecretRef: "${SMTP_PASSWORD}",
                },
                templates: {
                    emailVerification: {
                        subject: "Verify {{siteName}}",
                        html: '<a href="{{actionUrl}}">Verify</a>',
                    },
                    passwordReset: {
                        subject: "",
                        html: "",
                    },
                },
            },
        });

        const reloaded = new LocalFsCmsRepository(siteDir, new Map());
        const system = await reloaded.getSystem();
        const raw = await readFile(join(siteDir, "system.json"), "utf-8");

        expect(system.email.smtp.host).toBe("smtp.example.com");
        expect(system.email.smtp.passwordSecretRef).toBe("${SMTP_PASSWORD}");
        expect(system.email.templates.emailVerification.subject).toBe("Verify {{siteName}}");
        expect(JSON.parse(raw).email.enabled).toBe(true);
    });
});
