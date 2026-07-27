import { describe, expect, test } from "bun:test";
import type { ThemeSettings, ThemeSource } from "@bernouy/cms-content";
import { renderToken } from "cms-control/components/admin/Theme/editor/tokens/view";
import {
    resolveThemeTokenValue,
    setThemeTokenReference,
} from "cms-control/components/admin/Theme/editor/tokens/values";

describe("theme token references", () => {
    test("offers compatible references inline with searchable ownership labels", () => {
        const settings = fixture();
        const token = settings.sources[2]!.categories[0]!.tokens[0]!;
        const row = renderToken(token, settings, settings.themes[0]!, "light", false);
        const control = valueControl(row);
        const options = Array.from(control.querySelectorAll("option"), (option) => ({
            label: option.textContent,
            value: option.value,
        }));

        expect(control.localName).toBe("p9r-combobox");
        expect(control.hasAttribute("creatable")).toBeTrue();
        expect(options).toEqual([
            {
                label: "Colors · General · Brand · --brand-color",
                value: "var(--brand-color)",
            },
            {
                label: "Photo Albums · General · Album border · --album-border",
                value: "var(--album-border)",
            },
        ]);
        expect(options.some((option) => option.value === "var(--album-accent)")).toBeFalse();
        expect(options.some((option) => option.value === "var(--space-md)")).toBeFalse();
        expect(options.some((option) => option.value === "var(--commerce-accent)")).toBeFalse();
    });

    test("lets independent tokens select compatible integration tokens", () => {
        const settings = fixture();
        const token = settings.sources[0]!.categories[0]!.tokens[0]!;
        const row = renderToken(token, settings, settings.themes[0]!, "light", false);
        const values = Array.from(valueControl(row).querySelectorAll("option"), (option) => option.value);

        expect(values).toContain("var(--album-border)");
        expect(values).toContain("var(--commerce-accent)");
        expect(values).not.toContain("var(--album-accent)");
        expect(
            setThemeTokenReference(settings, settings.themes[0]!, "light", "brand-color", "commerce-accent"),
        ).toBeTrue();
        expect(settings.themes[0]!.values.light["brand-color"]).toBe("var(--commerce-accent)");
    });

    test("writes exact var references and rejects cycles", () => {
        const settings = fixture();
        const theme = settings.themes[0]!;

        expect(setThemeTokenReference(settings, theme, "light", "album-accent", "brand-color")).toBeTrue();
        expect(theme.values.light["album-accent"]).toBe("var(--brand-color)");
        expect(setThemeTokenReference(settings, theme, "light", "brand-color", "album-accent")).toBeFalse();
        expect(setThemeTokenReference(settings, theme, "light", "album-accent", "space-md")).toBeFalse();
        expect(setThemeTokenReference(settings, theme, "light", "album-accent", "commerce-accent")).toBeFalse();
        expect(theme.values.light["brand-color"]).toBeUndefined();
    });

    test("resolves a linked integration color to its final value", () => {
        const settings = fixture();
        const resolved = resolveThemeTokenValue(settings, settings.themes[0]!, "light", "album-accent");

        expect(resolved.state).toBe("resolved");
        expect(resolved.reference?.token.id).toBe("brand-color");
        expect(resolved.value).toBe("#336699");
        expect(resolved.raw).toBe("var(--brand-color)");
    });

    test("resolves a known fallback when the preferred CSS variable is external", () => {
        const settings = fixture();
        const theme = settings.themes[0]!;
        theme.values.light["album-accent"] = "var(--external-accent, var(--brand-color))";

        const resolved = resolveThemeTokenValue(settings, theme, "light", "album-accent");

        expect(resolved.state).toBe("resolved");
        expect(resolved.reference?.token.id).toBe("brand-color");
        expect(resolved.value).toBe("#336699");
    });
});

function valueControl(root: ParentNode): HTMLElement & { value: string } {
    return root.querySelector("[data-token-value-control]") as HTMLElement & { value: string };
}

function fixture(): ThemeSettings {
    return {
        activeThemeId: "default",
        sources: [
            source("colors", "Colors", [token("brand-color", "Brand", "color", "#336699")]),
            source("spacing", "Spacing & layout", [token("space-md", "Medium spacing", "length", "1rem")]),
            {
                ...source("integration-photo-albums", "Photo Albums", [
                    token("album-accent", "Album accent", "color", "var(--brand-color)"),
                    token("album-border", "Album border", "color", "#cccccc"),
                ]),
                owner: { kind: "integration", integrationId: "photo-albums" },
            },
            {
                ...source("integration-commerce", "Commerce", [
                    token("commerce-accent", "Commerce accent", "color", "#993366"),
                ]),
                owner: { kind: "integration", integrationId: "commerce" },
            },
        ],
        themes: [{ id: "default", name: "Default", values: { light: {}, dark: {} } }],
    };
}

function source(id: string, label: string, tokens: ReturnType<typeof token>[]): ThemeSource {
    return {
        id,
        label,
        supportsModes: true,
        categories: [{ id: "general", label: "General", description: `${label} tokens.`, tokens }],
    };
}

function token(id: string, label: string, type: "color" | "length", value: string) {
    return { id, variable: id, label, description: `${label} token.`, type, defaults: { light: value } };
}
