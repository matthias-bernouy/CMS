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
                ${settingsHtml("settings/_site/general.html")}
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
        expect(general?.hasAttribute("active")).toBe(true);
    });
});
