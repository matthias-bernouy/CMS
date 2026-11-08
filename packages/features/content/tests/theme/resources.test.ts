import { expect, test } from "bun:test";
import {
    defaultThemeSettings,
    generateThemeCss,
    reconcileSubmittedThemeSettings,
    validateThemeSettings,
} from "@bernouy/content";
import type { ThemeSource } from "@bernouy/content";
import { canReferenceThemeToken } from "@bernouy/content/theme";

function source(namespace = "acme/base"): ThemeSource {
    const prefix = namespace.replace("/", "--");
    return {
        id: "resource-" + prefix,
        label: "Copied defaults",
        supportsModes: true,
        owner: { kind: "resource", namespace },
        categories: [
            {
                id: "base",
                label: "Base",
                description: "",
                tokens: [
                    {
                        id: prefix + "--font",
                        variable: prefix + "--font",
                        label: "Font",
                        description: "",
                        type: "font-family",
                        defaults: { light: '"' + prefix + '--sans"' },
                    },
                ],
            },
        ],
        fontFaces: [
            {
                id: prefix + "--sans-regular",
                family: prefix + "--sans",
                source: `{{ cms.asset.${namespace}.fonts/sans.woff2 }}`,
                style: "normal",
                weight: "400",
                display: "swap",
            },
        ],
    };
}
test("ordinary resource theme ownership preserves fonts and namespace checks without an installed release", () => {
    const settings = defaultThemeSettings();
    settings.sources.push(source());
    const validated = validateThemeSettings(settings);
    expect(generateThemeCss(validated)).toContain("{{ cms.asset.acme/base.fonts/sans.woff2 }}");
    expect(generateThemeCss(validated)).toContain('--acme--base--font: "acme--base--sans"');
    const forged = structuredClone(settings);
    forged.sources[1]!.fontFaces![0]!.source = "{{ cms.asset.acme/foreign.fonts/sans.woff2 }}";
    expect(() => validateThemeSettings(forged)).toThrow("immutable collection asset");
    expect(settings.sources[1]!.fontFaces![0]!.source).toContain("acme/base");
    delete forged.sources[1]!.owner;
    expect(() => validateThemeSettings(forged)).toThrow("reserved source id");
});
test("resource token references retain explicit namespace dependencies and reject undeclared imports", () => {
    const settings = defaultThemeSettings();
    settings.sources.push(source(), source("acme/foreign"));
    expect(
        canReferenceThemeToken(settings, settings.themes[0]!, "light", "acme--base--font", "acme--foreign--font"),
    ).toBe(false);
    settings.sources[1]!.categories[0]!.tokens[0]!.defaults!.light = "var(--acme--foreign--font)";
    expect(() => validateThemeSettings(settings)).toThrow("undeclared dependency");
    const owner = settings.sources[1]!.owner;
    if (owner?.kind !== "resource") {
        throw new Error("Fixture resource owner missing");
    }
    owner.tokenImports = ["acme--foreign--font"];
    expect(() => validateThemeSettings(settings)).not.toThrow();
    expect(
        canReferenceThemeToken(settings, settings.themes[0]!, "light", "acme--base--font", "acme--foreign--font"),
    ).toBe(true);
});
test("editor submissions cannot forge, delete or replace copied resource catalogues", () => {
    const current = defaultThemeSettings();
    current.sources.push(source());
    const submitted = structuredClone(current);
    submitted.sources[1]!.label = "Forged label";
    submitted.sources[1]!.owner = { kind: "resource", namespace: "acme/foreign" };
    submitted.themes[0]!.values.light["acme--base--font"] = "serif";
    const reconciled = reconcileSubmittedThemeSettings(current, submitted, []);
    expect(reconciled.sources[1]).toEqual(current.sources[1]);
    expect(reconciled.themes[0]!.values.light["acme--base--font"]).toBe("serif");
    expect(submitted.sources[1]!.label).toBe("Forged label");
});
