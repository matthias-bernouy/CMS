import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "cms-control/components";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
});

describe("admin settings binding", () => {
    test("renders the general settings page from the loaded settings source", async () => {
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/system/settings")) {
                return json({
                    site: {
                        name:        "Demo",
                        host:        "https://example.com",
                        favicon:     "",
                        language:    "",
                        notFound:    { path: "" },
                        forbidden:   { path: "" },
                        serverError: { path: "" },
                        login:       { path: "" },
                        theme:       "",
                    },
                    editor: { layoutCategory: "" },
                    security: {},
                    email: {
                        enabled:   true,
                        transport: "smtp",
                        fromEmail: "",
                        fromName:  "",
                        replyTo:   "",
                        smtp:      {
                            host:              "",
                            port:              587,
                            secure:            false,
                            username:          "",
                            passwordSecretRef: "",
                        },
                        templates: {
                            emailVerification: { subject: "", html: "" },
                            passwordReset:     { subject: "", html: "" },
                        },
                    },
                    pages:            [{ path: "/404", title: "Not found" }],
                    layoutCategories: ["Layouts"],
                });
            }
            if (href.includes("/api/identity/providers")) return json([]);
            if (href.includes("/api/secrets")) return json([]);
            return json({});
        }) as typeof fetch;

        window.history.replaceState(null, "", "/admin/settings/general");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `
            <cms-binding-core>
                ${settingsHtml("settings/general.html")}
            </cms-binding-core>
        `;

        await waitFor(() => document.querySelector("#settings-form") !== null);

        expect(document.querySelector("#settings-form")).not.toBeNull();
        expect(document.querySelector("cms-shell-detail")).not.toBeNull();
        expect(document.querySelectorAll("cms-detail-section").length).toBeGreaterThan(0);
        expect(document.querySelector("p9r-tabs")).toBeNull();
        expect(document.querySelector("cms-settings-nav")).not.toBeNull();
        expect(document.querySelector("cms-settings-sections")).toBeNull();
        expect(document.querySelector("p9r-input[name='site.name']")?.getAttribute("value")).toBe("Demo");
        expect(document.querySelector("p9r-select[name='site.notFound'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.forbidden'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.serverError'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.login'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.notFound']")?.getAttribute("label")).toBe("Not Found page");
        expect(document.querySelector("p9r-select[name='site.serverError']")?.getAttribute("label")).toBe("Internal Server Error page");

        const settingsNav = document.querySelector("cms-settings-nav");
        const general = settingsNav?.shadowRoot?.querySelector<HTMLElement>("[data-settings-section='general']");
        const connectors = settingsNav?.shadowRoot?.querySelector<HTMLElement>("[data-settings-section='connectors']");
        expect(general?.hasAttribute("active")).toBe(true);
        expect(connectors?.getAttribute("href")).toBe("/admin/settings/connectors");
    });

    test("renders Supabase connector settings with a write-only access token", async () => {
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/integrations/connector-provider")) {
                return json({
                    provider: "supabase",
                    enabled: true,
                    projectRef: "abcdefghijklmnopqrst",
                    accessTokenConfigured: true,
                    accessToken: "must-not-be-rendered",
                });
            }
            return json({});
        }) as typeof fetch;

        window.history.replaceState(null, "", "/admin/settings/connectors");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `
            <cms-binding-core>
                ${settingsHtml("settings/connectors.html")}
            </cms-binding-core>
        `;

        await waitFor(() => document.querySelector("#connector-provider-form") !== null);

        expect(document.querySelector("cms-shell-detail")).not.toBeNull();
        expect(document.querySelector("cms-settings-nav")).not.toBeNull();
        expect(document.querySelector("#settings-form")).toBeNull();
        const providerForm = document.querySelector("#connector-provider-form");
        expect(providerForm).not.toBeNull();
        expect(providerForm?.hasAttribute("cms-source-success-reset")).toBe(false);
        expect(document.body.textContent).toContain("Connector providers");
        expect(document.body.textContent).toContain("Access token configured");
        expect(document.body.textContent).toContain("server-side secret store");
        expect(document.querySelector("p9r-input[name='projectRef']")?.getAttribute("value"))
            .toBe("abcdefghijklmnopqrst");
        const token = document.querySelector<HTMLElement>("p9r-input[name='accessToken']");
        expect(token?.getAttribute("type")).toBe("password");
        expect(token?.getAttribute("value")).toBeNull();
        expect(token?.getAttribute("placeholder")).toContain("Leave blank");
        expect(document.body.innerHTML).not.toContain("must-not-be-rendered");
        expect(document.querySelector("p9r-tabs")).toBeNull();
    });

    test("hydrates the email password secret picker from loaded settings", async () => {
        const secretRef = "${PROTON_SMTP_TOKEN}";
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/system/settings")) {
                return json({
                    site: {
                        name:        "Demo",
                        host:        "https://example.com",
                        favicon:     "",
                        language:    "",
                        notFound:    { path: "" },
                        forbidden:   { path: "" },
                        serverError: { path: "" },
                        login:       { path: "" },
                        theme:       "",
                    },
                    editor: { layoutCategory: "" },
                    security: {},
                    email: {
                        enabled:   true,
                        transport: "smtp",
                        fromEmail: "no-reply@example.com",
                        fromName:  "Demo",
                        replyTo:   "",
                        smtp:      {
                            host:              "smtp.protonmail.ch",
                            port:              587,
                            secure:            true,
                            username:          "matthias@bernouy.fr",
                            passwordSecretRef: secretRef,
                        },
                        templates: {
                            emailVerification: { subject: "", html: "" },
                            passwordReset:     { subject: "", html: "" },
                        },
                    },
                    pages:            [],
                    layoutCategories: [],
                });
            }
            if (href.includes("/api/secrets")) return json(["PROTON_SMTP_TOKEN"]);
            return json({});
        }) as typeof fetch;

        window.history.replaceState(null, "", "/admin/settings/email");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `
            <cms-binding-core>
                ${settingsHtml("settings/email.html")}
            </cms-binding-core>
        `;

        await waitFor(() => document
            .querySelector("cms-credential-select[name='email.smtp.passwordSecretRef']")
            ?.getAttribute("value") === secretRef);

        const picker = document.querySelector<HTMLElement>("cms-credential-select[name='email.smtp.passwordSecretRef']");
        expect(picker?.shadowRoot?.querySelector(".value")?.textContent).toBe("PROTON_SMTP_TOKEN");
        expect((picker?.shadowRoot?.querySelector(".clear-btn") as HTMLElement | null)?.style.display).toBe("flex");
    });

    test("renders secret creation from the detail header modal", async () => {
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/secrets")) return json([]);
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

function settingsHtml(relativePath: string): string {
    const path = join(import.meta.dir, "../../src/static/admin", relativePath);
    return readFileSync(path, "utf8").replaceAll("{{BASE_PATH}}", "");
}

function json(data: unknown): Response {
    return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
    });
}

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
