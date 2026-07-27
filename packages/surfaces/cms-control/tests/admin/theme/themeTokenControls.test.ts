import { describe, expect, test } from "bun:test";
import type { ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";
import { renderToken } from "cms-control/components/admin/Theme/editor/tokens/view";

describe("theme token controls", () => {
    test("uses the resolved value for a linked color preview", () => {
        const settings = fixture();
        const accent = settings.sources[0]!.categories[0]!.tokens[1]!;
        const row = renderToken(accent, settings, settings.themes[0]!, "light", false);

        expect(row.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#336699");
        expect(valueControl(row).value).toBe("var(--brand-color)");
        expect(row.querySelector(".reference-status")?.textContent).toContain("Uses Brand · #336699");
    });

    test("uses a known fallback for calculated integration colors", () => {
        const settings = fixture();
        const accent = settings.sources[0]!.categories[0]!.tokens[1]!;
        accent.defaults!.light = "var(--external-accent, var(--brand-color))";
        const row = renderToken(accent, settings, settings.themes[0]!, "light", false);

        expect(row.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#336699");
        expect(valueControl(row).value).toBe("var(--external-accent, var(--brand-color))");
    });

    test("does not show a false black preview for an unresolved color", () => {
        const settings = fixture();
        const accent = settings.sources[0]!.categories[0]!.tokens[1]!;
        accent.defaults!.light = "var(--external-accent)";
        const row = renderToken(accent, settings, settings.themes[0]!, "light", false);

        expect(row.querySelector<HTMLInputElement>('input[type="color"]')?.hidden).toBeTrue();
    });

    test("renders dedicated length, number and shadow controls", () => {
        const settings = fixture();
        const category = settings.sources[0]!.categories[0]!;
        const theme = settings.themes[0]!;
        const expectations = [
            { id: "content-width", className: "length-control", placeholder: "1rem" },
            { id: "overlay-opacity", className: "number-control", placeholder: "1" },
            {
                id: "card-shadow",
                className: "shadow-control",
                placeholder: "0 2px 8px rgb(0 0 0 / 10%)",
            },
        ];

        for (const expected of expectations) {
            const token = category.tokens.find((item) => item.id === expected.id)!;
            const row = renderToken(token, settings, theme, "light", true);
            const input = valueControl(row);
            expect(row.dataset.tokenType).toBe(token.type);
            expect(input.classList.contains(expected.className)).toBeTrue();
            expect(input.getAttribute("placeholder")).toBe(expected.placeholder);
            expect(input.hasAttribute("creatable")).toBeTrue();
            expect(row.querySelector<HTMLSelectElement>("[data-token-type-control]")?.value).toBe(token.type);
            expect(row.querySelector<HTMLButtonElement>("[data-delete-token]")?.ariaLabel).toBe(
                `Delete ${token.label}`,
            );
        }
    });
});

function valueControl(root: ParentNode): HTMLElement & { value: string } {
    return root.querySelector("[data-token-value-control]") as HTMLElement & { value: string };
}

function fixture(): ThemeSettings {
    return {
        activeThemeId: "default",
        sources: [
            {
                id: "site-tokens",
                label: "Site tokens",
                supportsModes: true,
                categories: [
                    {
                        id: "general",
                        label: "General",
                        description: "Site design tokens.",
                        tokens: [
                            token("brand-color", "Brand", "color", "#336699"),
                            token("album-accent", "Album accent", "color", "var(--brand-color)"),
                            token("content-width", "Content width", "length", "72rem"),
                            token("overlay-opacity", "Overlay opacity", "number", "0.8"),
                            token("card-shadow", "Card shadow", "shadow", "0 2px 8px rgb(0 0 0 / 10%)"),
                        ],
                    },
                ],
            },
        ],
        themes: [{ id: "default", name: "Default", values: { light: {}, dark: {} } }],
    };
}

function token(id: string, label: string, type: ThemeTokenType, value: string): ThemeToken {
    return { id, variable: id, label, description: `${label} token.`, type, defaults: { light: value } };
}
