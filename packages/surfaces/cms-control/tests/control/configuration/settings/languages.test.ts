import { afterEach, describe, expect, test } from "bun:test";
import { ContentValidationError, defaultSystem, mergeSystemUpdate, validateSettingsPatch } from "@bernouy/cms-content";
import "cms-control/components";
import { publicStaticPath } from "cms-control/core/admin/registerEndpoints/serveStaticFolder/scanStaticFolder";
import { parseSettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";
import { json, resetSettingsTest, settingsHtml, waitFor } from "../../../admin/resources/settingsTestUtils";

afterEach(resetSettingsTest);

describe("site language settings", () => {
    test("keeps the existing public settings routes after grouping site pages", () => {
        expect(publicStaticPath("admin/_access/settings/_site/general.html")).toBe("admin/settings/general.html");
        expect(publicStaticPath("admin/_access/settings/_site/languages.html")).toBe("admin/settings/languages.html");
    });

    test("keeps an older site's default language without a migration", () => {
        const system = mergeSystemUpdate(defaultSystem(), { site: { language: "fr-FR" } as never });

        expect(system.site.language).toBe("fr-FR");
        expect(system.site.additionalLanguages).toEqual([]);
    });

    test("never duplicates the default in the additional list", () => {
        const system = mergeSystemUpdate(defaultSystem(), {
            site: { language: "fr", additionalLanguages: ["de", "FR"] } as never,
        });

        expect(system.site.additionalLanguages).toEqual(["de"]);
    });

    test("parses, canonicalizes, and deduplicates additional languages", () => {
        const dto = parseSettingsUpdateDto({
            "site.language": "fr",
            "site.additionalLanguages": "en-us\nDE\nen-US",
        });
        const validated = validateSettingsPatch(dto);

        expect(validated.site?.language).toBe("fr");
        expect(validated.site?.additionalLanguages).toEqual(["de", "en-US"]);
        expect(() => validateSettingsPatch({ site: { additionalLanguages: ["not_a_locale"] } })).toThrow(
            ContentValidationError,
        );
    });

    test("renders selected and available languages and submits only their settings", async () => {
        let site = { language: "fr", additionalLanguages: [] as string[] };
        let submitted: Record<string, string> | undefined;
        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
            if (!String(url).includes("/api/system/settings")) {
                return json({});
            }
            if (init?.method === "POST") {
                submitted = JSON.parse(String(init.body)) as Record<string, string>;
                site = {
                    language: submitted["site.language"] ?? "",
                    additionalLanguages: (submitted["site.additionalLanguages"] ?? "").split("\n").filter(Boolean),
                };
                return new Response(null, { status: 204 });
            }
            return json({ site });
        }) as typeof fetch;

        window.history.replaceState(null, "", "/admin/settings/languages");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `<cms-binding-core>${settingsHtml("settings/_site/languages.html")}</cms-binding-core>`;

        await waitFor(() => document.querySelectorAll("[data-selected-list] .language-row").length === 1);
        const settings = document.querySelector("cms-language-settings")!;
        expect(settings.querySelector("[data-selected-list]")?.textContent).toContain("French");
        expect(settings.querySelector('.language-title p9r-badge[color="success"]')?.textContent).toBe("Default");
        expect(
            settings.querySelector('.language-title p9r-badge[color="success"]')?.closest(".language-title")
                ?.textContent,
        ).toContain("French");
        expect(settings.querySelectorAll(".language-actions button")).toHaveLength(0);
        expect(settings.querySelector(".language-actions p9r-button[variant='outlined']")).not.toBeNull();
        expect(settings.querySelector("[data-available-list]")?.textContent).toContain("German");
        expect(
            document
                .querySelector("cms-settings-nav")
                ?.shadowRoot?.querySelector("[data-settings-section='languages']")
                ?.hasAttribute("active"),
        ).toBe(true);

        settings.querySelector<HTMLElement>('[data-language-action="add"][data-language-code="de"]')!.click();
        settings.querySelector<HTMLElement>('[data-language-action="default"][data-language-code="de"]')!.click();
        expect(document.querySelector<HTMLInputElement>('input[name="site.language"]')?.value).toBe("de");
        expect(document.querySelector<HTMLInputElement>('input[name="site.additionalLanguages"]')?.value).toBe("fr");
        expect(settings.querySelector("[data-selected-list]")?.textContent).toContain("German");
        expect(
            settings.querySelector('.language-title p9r-badge[color="success"]')?.closest(".language-title")
                ?.textContent,
        ).toContain("German");
        expect(
            Array.from(
                settings.querySelectorAll("[data-selected-list] .language-name strong"),
                (item) => item.textContent,
            ),
        ).toEqual(["French", "German"]);

        document.querySelector<HTMLFormElement>("#language-settings-form")!.requestSubmit();
        await waitFor(() => submitted !== undefined);
        expect(submitted).toEqual({ "site.language": "de", "site.additionalLanguages": "fr" });
        await waitFor(() => document.querySelector("cms-form-save-action")?.getAttribute("state") === "saved");
    });

    test("preserves a legacy default that is not in the offered list", async () => {
        globalThis.fetch = (async () => json({ site: { language: "fr-FR" } })) as unknown as typeof fetch;
        window.history.replaceState(null, "", "/admin/settings/languages");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `<cms-binding-core>${settingsHtml("settings/_site/languages.html")}</cms-binding-core>`;

        await waitFor(() => document.querySelectorAll("[data-selected-list] .language-row").length === 1);
        expect(document.querySelector("[data-selected-list]")?.textContent).toContain("French");
        expect(document.querySelector<HTMLInputElement>('input[name="site.language"]')?.value).toBe("fr-FR");
    });

    test("lets an unconfigured site choose its first language", async () => {
        globalThis.fetch = (async () =>
            json({ site: { language: "", additionalLanguages: [] } })) as unknown as typeof fetch;
        window.history.replaceState(null, "", "/admin/settings/languages");
        document.head.innerHTML = `<meta name="basePath" content="">`;
        document.body.innerHTML = `<cms-binding-core>${settingsHtml("settings/_site/languages.html")}</cms-binding-core>`;

        await waitFor(() =>
            Boolean(document.querySelector("cms-language-settings")?.querySelector("[data-available-list] p9r-button")),
        );
        const settings = document.querySelector("cms-language-settings")!;
        expect(settings.querySelector("[data-selected-empty]")?.hasAttribute("hidden")).toBe(false);
        settings.querySelector<HTMLElement>('[data-language-action="add"][data-language-code="en"]')!.click();
        expect(document.querySelector<HTMLInputElement>('input[name="site.language"]')?.value).toBe("en");
        expect(settings.querySelector("[data-selected-list]")?.textContent).toContain("Default");
        expect(settings.querySelector('[data-language-action="remove"][data-language-code="en"]')).toBeNull();
    });

    test("clears saved feedback without making an unchanged form editable", async () => {
        document.body.innerHTML = `
            <form id="languages-form"><input name="language"></form>
            <cms-form-save-action form="languages-form" label="Save languages" saved-feedback-duration="10"></cms-form-save-action>
        `;
        await Promise.resolve();

        const form = document.querySelector<HTMLFormElement>("#languages-form")!;
        const action = document.querySelector("cms-form-save-action")!;
        const button = action.shadowRoot!.querySelector<HTMLElement & { disabled: boolean }>("p9r-button")!;
        const status = action.shadowRoot!.querySelector<HTMLElement>("[data-status]")!;
        form.dispatchEvent(new CustomEvent("cms-source:success"));
        expect(action.getAttribute("state")).toBe("saved");

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(action.getAttribute("state")).toBe("pristine");
        expect(status.textContent).toBe("Save languages");
        expect(button.disabled).toBe(true);
    });
});
