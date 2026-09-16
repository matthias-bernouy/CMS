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
        expect(system.site.activeLanguages).toEqual([]);
    });

    test("never duplicates the default in the additional list", () => {
        const system = mergeSystemUpdate(defaultSystem(), {
            site: { language: "fr", additionalLanguages: ["de", "FR"], activeLanguages: ["de", "FR"] } as never,
        });

        expect(system.site.additionalLanguages).toEqual(["de"]);
        expect(system.site.activeLanguages).toEqual(["de"]);
    });

    test("parses, canonicalizes, and deduplicates additional languages", () => {
        const dto = parseSettingsUpdateDto({
            "site.language": "fr",
            "site.additionalLanguages": "en-us\nDE\nen-US",
            "site.activeLanguages": "DE\nde",
        });
        const validated = validateSettingsPatch(dto);

        expect(validated.site?.language).toBe("fr");
        expect(validated.site?.additionalLanguages).toEqual(["de", "en-US"]);
        expect(validated.site?.activeLanguages).toEqual(["de"]);
        expect(() => validateSettingsPatch({ site: { additionalLanguages: ["not_a_locale"] } })).toThrow(
            ContentValidationError,
        );
        expect(() => validateSettingsPatch({ site: { activeLanguages: ["not_a_locale"] } })).toThrow(
            ContentValidationError,
        );
    });

    test("renders selected and available languages and submits only their settings", async () => {
        let site = { language: "fr", additionalLanguages: [] as string[], activeLanguages: [] as string[] };
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
                    activeLanguages: (submitted["site.activeLanguages"] ?? "").split("\n").filter(Boolean),
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
        expect(document.querySelector('cms-shell-detail [slot="description"]')).toBeNull();
        expect(settings.querySelector("[data-selected-list]")?.textContent).toContain("French");
        expect(settings.querySelector<HTMLElement & { value: string }>("[data-default-select]")?.value).toBe("fr");
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
        expect(settings.querySelector('[data-language-action="default"]')).toBeNull();
        expect(settings.querySelector("[data-selected-list]")?.textContent).toContain("Draft");
        const switchControl = settings.querySelector<HTMLElement>('w13c-switch[data-language-code="de"]')!;
        expect(switchControl.parentElement?.querySelector("p9r-badge")?.textContent).toBe("Draft");
        expect(switchControl.hasAttribute("checked")).toBe(false);
        switchControl.click();
        expect(
            settings.querySelector<HTMLElement>('w13c-switch[data-language-code="de"]')?.hasAttribute("checked"),
        ).toBe(true);
        expect(
            settings.querySelector('w13c-switch[data-language-code="de"]')?.parentElement?.querySelector("p9r-badge")
                ?.textContent,
        ).toBe("Active");
        expect(document.querySelector<HTMLInputElement>('input[name="site.activeLanguages"]')?.value).toBe("de");
        const defaultSelect = settings.querySelector<HTMLElement & { value: string }>("[data-default-select]")!;
        await waitFor(() => Boolean(defaultSelect.shadowRoot?.querySelector('[data-value="de"]')));
        defaultSelect.value = "de";
        defaultSelect.dispatchEvent(new Event("change", { bubbles: true }));
        expect(document.querySelector<HTMLInputElement>('input[name="site.language"]')?.value).toBe("de");
        expect(document.querySelector<HTMLInputElement>('input[name="site.additionalLanguages"]')?.value).toBe("fr");
        expect(document.querySelector<HTMLInputElement>('input[name="site.activeLanguages"]')?.value).toBe("fr");
        expect(settings.querySelector("[data-selected-list]")?.textContent).toContain("German");
        expect(
            settings.querySelector('[data-language-action="remove"][data-language-code="fr"]')?.closest(".language-row")
                ?.textContent,
        ).toContain("Active");
        const germanRow = Array.from(settings.querySelectorAll("[data-selected-list] .language-row")).find(
            (row) => row.querySelector("strong")?.textContent === "German",
        );
        expect(germanRow?.textContent).toContain("Default");
        expect(
            Array.from(
                settings.querySelectorAll("[data-selected-list] .language-name strong"),
                (item) => item.textContent,
            ),
        ).toEqual(["French", "German"]);

        document.querySelector<HTMLFormElement>("#language-settings-form")!.requestSubmit();
        await waitFor(() => submitted !== undefined);
        expect(submitted).toEqual({
            "site.language": "de",
            "site.additionalLanguages": "fr",
            "site.activeLanguages": "fr",
        });
        await waitFor(() => document.querySelector("cms-form-save-action")?.getAttribute("state") === "saved");

        const refreshed = document.querySelector("cms-language-settings")!;
        refreshed.querySelector<HTMLElement>('w13c-switch[data-language-code="fr"]')!.click();
        expect(document.querySelector<HTMLInputElement>('input[name="site.activeLanguages"]')?.value).toBe("");
        expect(refreshed.querySelector("[data-selected-list]")?.textContent).toContain("Draft");
        refreshed.querySelector<HTMLElement>('p9r-icon-button[data-language-code="fr"]')!.click();
        expect(document.querySelector<HTMLInputElement>('input[name="site.additionalLanguages"]')?.value).toBe("");
        expect(refreshed.querySelector("[data-available-list]")?.textContent).toContain("French");
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
        expect(settings.querySelector("[data-default-setting]")?.hasAttribute("hidden")).toBe(true);
        settings.querySelector<HTMLElement>('[data-language-action="add"][data-language-code="en"]')!.click();
        expect(document.querySelector<HTMLInputElement>('input[name="site.language"]')?.value).toBe("en");
        expect(settings.querySelector("[data-default-setting]")?.hasAttribute("hidden")).toBe(false);
        expect(settings.querySelector("[data-selected-list]")?.textContent).toContain("Default");
        expect(settings.querySelector('[data-language-action="remove"][data-language-code="en"]')).toBeNull();
        expect(settings.querySelector('w13c-switch[data-language-code="en"]')).toBeNull();
    });
});
