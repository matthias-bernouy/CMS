import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components";
import { json, resetSettingsTest, settingsHtml, waitFor } from "./settingsTestUtils";

afterEach(resetSettingsTest);

describe("admin settings binding", () => {
    test("renders the general settings page from the loaded settings source", async () => {
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/system/settings")) {
                return json({
                    site: {
                        name: "Demo",
                        host: "https://example.com",
                        favicon: "/media/favicon.svg",
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
                        fromEmail: "",
                        fromName: "",
                        replyTo: "",
                        smtp: {
                            host: "",
                            port: 587,
                            secure: false,
                            username: "",
                            passwordSecretRef: "",
                        },
                        templates: {
                            emailVerification: { subject: "", html: "" },
                            passwordReset: { subject: "", html: "" },
                        },
                    },
                    pages: [{ path: "/404", title: "Not found" }],
                });
            }
            if (href.includes("/api/identity/providers")) {
                return json([]);
            }
            if (href.includes("/api/secrets")) {
                return json([]);
            }
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
        const favicon = document.querySelector<HTMLElement & { value: string }>(
            "cms-media-input[name='site.favicon']",
        )!;
        expect(favicon.value).toBe("/media/favicon.svg");
        expect(favicon.shadowRoot!.querySelector(".tile")?.classList.contains("has-value")).toBe(true);
        expect(favicon.shadowRoot!.querySelector("img")?.getAttribute("src")).toBe("/media/favicon.svg");
        expect(document.querySelector("p9r-select[name='site.notFound'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.forbidden'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.serverError'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.login'] option[value='/404']")).not.toBeNull();
        expect(document.querySelector("p9r-select[name='site.notFound']")?.getAttribute("label")).toBe(
            "Not Found page",
        );
        expect(document.querySelector("p9r-select[name='site.serverError']")?.getAttribute("label")).toBe(
            "Internal Server Error page",
        );

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
        expect(document.querySelector("p9r-input[name='projectRef']")?.getAttribute("value")).toBe(
            "abcdefghijklmnopqrst",
        );
        const token = document.querySelector<HTMLElement>("p9r-input[name='accessToken']");
        expect(token?.getAttribute("type")).toBe("password");
        expect(token?.getAttribute("value")).toBeNull();
        expect(token?.getAttribute("placeholder")).toContain("Leave blank");
        expect(document.body.innerHTML).not.toContain("must-not-be-rendered");
        expect(document.querySelector("p9r-tabs")).toBeNull();
    });
});
