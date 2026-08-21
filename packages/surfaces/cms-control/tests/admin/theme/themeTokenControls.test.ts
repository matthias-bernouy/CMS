import { describe, expect, test } from "bun:test";
import type { ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";
import {
    handleLengthControlMode,
    handleThemeInput,
    handleTokenControlMode,
} from "cms-control/components/admin/Theme/editor/controller/inputEvents";
import { renderToken } from "cms-control/components/admin/Theme/editor/tokens/view";

describe("theme token controls", () => {
    test("uses the resolved value for a linked color preview", () => {
        const settings = fixture();
        const accent = settings.sources[0]!.categories[0]!.tokens[1]!;
        const row = renderToken(accent, settings, settings.themes[0]!, "light", false);

        expect(row.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#336699");
        expect(valueControl(row).value).toBe("var(--brand-color)");
        expect(valueControl(row).hasAttribute("invalid")).toBeFalse();
        expect(valueMode(row).getAttribute("value")).toBe("reference");
        expect(valueControl(row).hasAttribute("creatable")).toBeFalse();

        row.addEventListener("change", handleTokenControlMode);
        const switcher = valueMode(row);
        switcher.value = "manual";
        switcher.dispatchEvent(new Event("change", { bubbles: true }));

        expect(switcher.value).toBe("manual");
        expect(valueControl(row).value).toBe("#336699");
        expect(row.querySelector<HTMLElement>("[data-reference-editor]")?.hidden).toBeTrue();
    });

    test("uses a known fallback for calculated integration colors", () => {
        const settings = fixture();
        const accent = settings.sources[0]!.categories[0]!.tokens[1]!;
        accent.defaults!.light = "var(--external-accent, var(--brand-color))";
        const row = renderToken(accent, settings, settings.themes[0]!, "light", false);

        expect(row.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#336699");
        expect(valueControl(row).value).toBe("var(--external-accent, var(--brand-color))");
        expect(valueControl(row).querySelector("option")?.textContent).toBe("Unavailable reference");
        expect(valueControl(row).textContent).not.toContain("--external-accent");
    });

    test("keeps the color picker available for an unresolved color", () => {
        const settings = fixture();
        const accent = settings.sources[0]!.categories[0]!.tokens[1]!;
        accent.defaults!.light = "var(--external-accent)";
        const row = renderToken(accent, settings, settings.themes[0]!, "light", false);
        const control = valueControl(row);

        expect(row.querySelector<HTMLInputElement>('input[type="color"]')?.hidden).toBeFalse();
        expect(row.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#000000");
        expect(control.hasAttribute("invalid")).toBeTrue();
        expect(control.getAttribute("hint-level")).toBe("error");
        expect(control.getAttribute("hint")).toBe("This reference is no longer available.");
    });

    test("keeps technical variable names out of reset labels", () => {
        const settings = fixture();
        const theme = settings.themes[0]!;
        theme.values.light["album-accent"] = "var(--brand-color)";
        const accent = settings.sources[0]!.categories[0]!.tokens[1]!;
        const row = renderToken(accent, settings, theme, "light", false);
        const reset = row.querySelector<HTMLButtonElement>("[data-reset-token]")!;

        expect(reset.title).toBe("Restore the default value");
        expect(`${reset.textContent} ${reset.title} ${reset.ariaLabel}`).not.toContain("--");
    });

    test("renders dedicated manual controls for each value type", () => {
        const settings = fixture();
        const category = settings.sources[0]!.categories[0]!;
        const theme = settings.themes[0]!;
        const rows = new Map(
            category.tokens.map((token) => [token.id, renderToken(token, settings, theme, "light", true)]),
        );

        const length = rows.get("content-width")!;
        expect(controlValue(length, "[data-length-number]")).toBe("72");
        expect(controlValue(length, "[data-length-unit]")).toBe("rem");
        expect(length.querySelector<HTMLElement>("[data-length-expression]")?.hidden).toBeTrue();

        const number = valueControl(rows.get("overlay-opacity")!);
        expect(number.localName).toBe("p9r-input");
        expect(number.getAttribute("type")).toBe("number");
        expect(number.value).toBe("0.8");

        const shadow = valueControl(rows.get("card-shadow")!);
        expect(shadow.localName).toBe("p9r-combobox");
        expect(shadow.hasAttribute("creatable")).toBeTrue();
        expect(Array.from(shadow.querySelectorAll("option"), (option) => option.textContent)).toEqual([
            "None",
            "Subtle",
            "Soft",
            "Strong",
        ]);

        const font = valueControl(rows.get("body-font")!);
        expect(font.localName).toBe("p9r-combobox");
        expect(font.hasAttribute("creatable")).toBeTrue();
        expect(Array.from(font.querySelectorAll("option"), (option) => option.textContent)).toContain(
            "System sans serif",
        );

        for (const token of category.tokens) {
            const row = rows.get(token.id)!;
            expect(row.dataset.tokenType).toBe(token.type);
            expect(valueMode(row).getAttribute("value")).toBe(token.id === "album-accent" ? "reference" : "manual");
            expect(row.querySelector("[data-token-type-control]")).toBeNull();
            expect(row.querySelector("[data-token-type-label]")?.textContent).toBe(typeLabel(token.type));
            expect(row.querySelector<HTMLButtonElement>("[data-edit-token]")?.ariaLabel).toBe(`Edit ${token.label}`);
            expect(row.querySelector("[data-token-label-text]")?.textContent).toBe(token.label);
            expect(row.querySelector("[data-delete-token]")).toBeNull();
            expect(row.lastElementChild?.matches("[data-edit-token]")).toBeTrue();
        }
    });

    test("keeps a concrete unit selected when an empty length leaves CSS expression mode", () => {
        const settings = fixture();
        const token = settings.sources[0]!.categories[0]!.tokens.find((item) => item.id === "content-width")!;
        token.defaults!.light = "";
        const row = renderToken(token, settings, settings.themes[0]!, "light", true);

        changeLengthUnit(row, settings, "vw");

        expect(settings.themes[0]!.values.light["content-width"]).toBe("0vw");
        const rendered = renderToken(token, settings, settings.themes[0]!, "light", true);
        expect(controlValue(rendered, "[data-length-number]")).toBe("0");
        expect(controlValue(rendered, "[data-length-unit]")).toBe("vw");
        expect(rendered.querySelector<HTMLElement>("[data-length-expression]")?.hidden).toBeTrue();
    });

    test("preserves the number when changing a concrete length unit", () => {
        const settings = fixture();
        const token = settings.sources[0]!.categories[0]!.tokens.find((item) => item.id === "content-width")!;
        const row = renderToken(token, settings, settings.themes[0]!, "light", true);

        changeLengthUnit(row, settings, "vw");

        expect(settings.themes[0]!.values.light["content-width"]).toBe("72vw");
        const rendered = renderToken(token, settings, settings.themes[0]!, "light", true);
        expect(controlValue(rendered, "[data-length-number]")).toBe("72");
        expect(controlValue(rendered, "[data-length-unit]")).toBe("vw");
    });
});

function valueControl(root: ParentNode): HTMLElement & { value: string } {
    return root.querySelector("[data-token-value-control]") as HTMLElement & { value: string };
}

function valueMode(root: ParentNode): HTMLElement & { value: string } {
    return root.querySelector("[data-token-input-mode]") as HTMLElement & { value: string };
}

function controlValue(root: ParentNode, selector: string): string | undefined {
    return (root.querySelector(selector) as (HTMLElement & { value: string }) | null)?.value;
}

function changeLengthUnit(root: HTMLElement, settings: ThemeSettings, value: string): void {
    root.addEventListener("change", (event) => {
        if (!handleLengthControlMode(event)) {
            handleThemeInput(event, {
                root: document.createElement("div").attachShadow({ mode: "open" }),
                settings,
                selection: { sourceId: "site-tokens", categoryId: "general" },
                selectedThemeId: "default",
                mode: "light",
            });
        }
    });
    const unit = root.querySelector<HTMLElement & { value: string }>("[data-length-unit]")!;
    unit.value = value;
    unit.dispatchEvent(new Event("change", { bubbles: true }));
}

function typeLabel(type: ThemeTokenType): string {
    return {
        color: "Color",
        "font-family": "Font family",
        length: "Length",
        number: "Number",
        shadow: "Shadow",
        value: "CSS value",
    }[type];
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
                            token("body-font", "Body font", "font-family", "system-ui, sans-serif"),
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
