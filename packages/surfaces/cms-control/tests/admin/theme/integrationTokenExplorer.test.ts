import { describe, expect, test } from "bun:test";
import type { ThemeSettings } from "@bernouy/cms-content";
import { renderTokenExplorer } from "cms-control/components/admin/Theme/editor/tokens/explorer";

describe("integration token explorer", () => {
    test("renders every integration category on a single page", () => {
        const root = explorerRoot();
        const settings = fixture();
        const source = settings.sources[0]!;

        renderTokenExplorer(root, {
            settings,
            source,
            category: source.categories[0]!,
            theme: settings.themes[0]!,
            mode: "light",
            catalogEditable: false,
            filter: "all",
            search: "",
        });

        expect(Array.from(root.querySelectorAll(".group-heading h4"), (item) => item.textContent)).toEqual([
            "Gallery",
            "Viewer",
        ]);
        expect(
            Array.from(root.querySelectorAll<HTMLElement>("[data-token-id]"), (item) => item.dataset.tokenId),
        ).toEqual(["album-accent", "album-gap", "album-caption-font", "album-shadow"]);
    });

    test("combines free-text search with token type filters", () => {
        const root = explorerRoot();
        const settings = fixture();
        const source = settings.sources[0]!;
        const base = {
            settings,
            source,
            category: source.categories[0]!,
            theme: settings.themes[0]!,
            mode: "light" as const,
            catalogEditable: false,
        };

        renderTokenExplorer(root, { ...base, filter: "color", search: "" });
        expect(root.querySelector("[data-token-filter='color']")?.getAttribute("aria-pressed")).toBe("true");
        expect(
            Array.from(root.querySelectorAll<HTMLElement>("[data-token-id]"), (item) => item.dataset.tokenId),
        ).toEqual(["album-accent"]);

        renderTokenExplorer(root, { ...base, filter: "all", search: "viewer caption" });
        expect(root.querySelector("[data-token-id='album-caption-font']")).not.toBeNull();
        expect(root.querySelectorAll("[data-token-id]")).toHaveLength(1);

        renderTokenExplorer(root, { ...base, filter: "color", search: "shadow" });
        expect(root.querySelector(".empty-category")?.textContent ?? "").toContain("No token matches");
    });
});

function explorerRoot(): ShadowRoot {
    const root = document.createElement("div").attachShadow({ mode: "open" });
    root.innerHTML = "<input data-token-search><div data-token-filters></div><div data-groups></div>";
    return root;
}

function fixture(): ThemeSettings {
    return {
        activeThemeId: "default",
        sources: [
            {
                id: "integration-photo-albums",
                label: "Photo Albums",
                supportsModes: true,
                owner: { kind: "integration", integrationId: "photo-albums" },
                categories: [
                    {
                        id: "gallery",
                        label: "Gallery",
                        description: "Album grid presentation.",
                        tokens: [
                            token("album-accent", "Accent", "Selected album", "color", "#336699"),
                            token("album-gap", "Grid gap", "Gallery spacing", "length", "1rem"),
                        ],
                    },
                    {
                        id: "viewer",
                        label: "Viewer",
                        description: "Full-screen viewer.",
                        tokens: [
                            token("album-caption-font", "Caption font", "Viewer caption", "font-family", "system-ui"),
                            token("album-shadow", "Photo shadow", "Viewer depth", "shadow", "0 1px 4px #0003"),
                        ],
                    },
                ],
            },
        ],
        themes: [{ id: "default", name: "Default", values: { light: {}, dark: {} } }],
    };
}

function token(
    id: string,
    label: string,
    description: string,
    type: "color" | "font-family" | "length" | "shadow",
    value: string,
) {
    return { id, variable: id, label, description, type, defaults: { light: value } };
}
