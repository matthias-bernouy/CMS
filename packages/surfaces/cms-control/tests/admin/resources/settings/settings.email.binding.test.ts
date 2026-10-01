import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components";
import { json, resetSettingsTest, settingsHtml, waitFor } from "./settingsTestUtils";

afterEach(resetSettingsTest);

describe("admin settings binding", () => {
    test("hydrates the email password secret picker from loaded settings", async () => {
        const secretRef = "${PROTON_SMTP_TOKEN}";
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/system/settings")) {
                return json({
                    site: {
                        name: "Demo",
                        host: "https://example.com",
                        favicon: "",
                        language: "",
                        notFound: { path: "" },
                        forbidden: { path: "" },
                        serverError: { path: "" },
                        login: { path: "" },
                        theme: "",
                    },
                    security: {},
                    email: {
                        enabled: true,
                        transport: "smtp",
                        fromEmail: "no-reply@example.com",
                        fromName: "Demo",
                        replyTo: "",
                        smtp: {
                            host: "smtp.protonmail.ch",
                            port: 587,
                            secure: true,
                            username: "matthias@bernouy.fr",
                            passwordSecretRef: secretRef,
                        },
                        templates: {
                            emailVerification: { subject: "", html: "" },
                            passwordReset: { subject: "", html: "" },
                        },
                    },
                    pages: [],
                });
            }
            if (href.includes("/api/secrets")) {
                return json(["PROTON_SMTP_TOKEN"]);
            }
            return json({});
        }) as typeof fetch;

        window.history.replaceState(null, "", "/admin/settings/email");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `
            <cms-binding-core>
                ${settingsHtml("settings/email.html")}
            </cms-binding-core>
        `;

        await waitFor(
            () =>
                document
                    .querySelector("cms-credential-select[name='email.smtp.passwordSecretRef']")
                    ?.getAttribute("value") === secretRef,
        );

        const picker = document.querySelector<HTMLElement>(
            "cms-credential-select[name='email.smtp.passwordSecretRef']",
        );
        expect(picker?.shadowRoot?.querySelector(".value")?.textContent).toBe("PROTON_SMTP_TOKEN");
        expect((picker?.shadowRoot?.querySelector(".clear-btn") as HTMLElement | null)?.style.display).toBe("flex");
    });

    test("renders secret creation from the detail header modal", async () => {
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/secrets")) {
                return json([]);
            }
            return json({});
        }) as typeof fetch;

        window.history.replaceState(null, "", "/admin/settings/secrets");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `
            <cms-binding-core>
                ${settingsHtml("settings/secrets.html")}
            </cms-binding-core>
        `;

        await waitFor(() => document.querySelector("cms-secrets")?.shadowRoot !== null);

        const secrets = document.querySelector("cms-secrets");
        expect(document.querySelector("p9r-open-modal[slot='actions']")).not.toBeNull();
        expect(document.querySelector("#add-secret-modal")).not.toBeNull();
        expect(document.querySelector("#add-secret-modal p9r-input[name='key']")).not.toBeNull();
        expect(secrets?.shadowRoot?.querySelector(".add")).toBeNull();
        expect(secrets?.shadowRoot?.querySelector("[data-action='add-submit']")).toBeNull();
    });
});
