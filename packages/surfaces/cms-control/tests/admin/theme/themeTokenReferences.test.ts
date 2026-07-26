import { describe, expect, test } from "bun:test";
import type { ThemeSettings, ThemeSource } from "@bernouy/cms-content";
import { ThemeExplorerController } from "cms-control/components/admin/Theme/editor/controller/explorerController";
import { renderTokenReferencePicker } from "cms-control/components/admin/Theme/editor/tokens/referencePicker";
import {
    resolveThemeTokenValue,
    setThemeTokenReference,
} from "cms-control/components/admin/Theme/editor/tokens/values";

describe("theme token references", () => {
    test("groups reference candidates by source", () => {
        const root = pickerRoot();
        const settings = fixture();

        renderTokenReferencePicker(root, {
            settings,
            theme: settings.themes[0]!,
            mode: "light",
            tokenId: "album-accent",
            search: "",
        });

        expect(
            Array.from(
                root.querySelectorAll<HTMLElement>("[data-reference-source]"),
                (item) => item.dataset.referenceSource,
            ),
        ).toEqual(["colors", "integration-photo-albums"]);
        expect(Array.from(root.querySelectorAll(".reference-group h5"), (item) => item.textContent)).toEqual([
            "Colors",
            "Photo Albums · Integration",
        ]);
        expect(root.querySelector("[data-reference-target='album-accent']")).toBeNull();
        expect(root.querySelector("[data-reference-target='brand-color'] code")?.textContent).toBe("--brand-color");
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

    test("keeps modal focus inside the picker and restores the opener", () => {
        const root = pickerRoot();
        const settings = fixture();
        const controller = new ThemeExplorerController();
        const context = {
            root,
            settings,
            selectedThemeId: "default",
            mode: "light" as const,
            render: () => undefined,
            showError: () => undefined,
        };
        const opener = root.querySelector<HTMLButtonElement>("[data-open-token-reference]")!;
        controller.handleClick({ target: opener } as unknown as Event, context);

        expect(root.querySelector<HTMLElement>("[data-background]")!.inert).toBeTrue();
        const close = root.querySelector<HTMLButtonElement>("[data-close-token-reference]")!;
        const last = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-reference-target]")).at(-1)!;
        last.focus();
        controller.handleKeyDown(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }), context);
        expect(root.activeElement).toBe(close);

        controller.handleKeyDown(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }), context);
        expect(root.querySelector<HTMLElement>("[data-reference-picker]")!.hidden).toBeTrue();
        expect(root.querySelector<HTMLElement>("[data-background]")!.inert).toBeFalse();
        expect(root.activeElement).toBe(opener);
    });
});

function pickerRoot(): ShadowRoot {
    const host = document.createElement("div");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
        <cms-shell-detail>
            <section data-background></section>
            <button data-open-token-reference="album-accent">Link token</button>
            <aside data-reference-picker hidden>
                <button data-close-token-reference>Close</button>
                <h4 data-reference-picker-title></h4>
                <input data-reference-search>
                <div data-reference-results></div>
                <p data-reference-empty hidden></p>
            </aside>
        </cms-shell-detail>
    `;
    return root;
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
        owner: { kind: "core" },
        categories: [{ id: "general", label: "General", description: `${label} tokens.`, tokens }],
    };
}

function token(id: string, label: string, type: "color" | "length", value: string) {
    return { id, variable: id, label, description: `${label} token.`, type, defaults: { light: value } };
}
