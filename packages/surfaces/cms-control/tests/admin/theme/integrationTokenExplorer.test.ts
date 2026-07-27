import { describe, expect, test } from "bun:test";
import type { ThemeSettings } from "@bernouy/cms-content";
import { renderTokenExplorer } from "cms-control/components/admin/Theme/editor/tokens/explorer";

describe("integration token explorer", () => {
    test("renders only the selected integration category", () => {
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

        expect(root.querySelector(".group-heading")).toBeNull();
        expect(
            Array.from(root.querySelectorAll<HTMLElement>("[data-token-id]"), (item) => item.dataset.tokenId),
        ).toEqual(["album-accent", "album-gap"]);
        expect(root.querySelector("[data-token-id='album-caption-font']")).toBeNull();
    });

    test("renders every token in the selected group without local explorer state", () => {
        const root = explorerRoot();
        const settings = fixture();
        const source = settings.sources[0]!;

        renderTokenExplorer(root, {
            settings,
            source,
            category: source.categories[1]!,
            theme: settings.themes[0]!,
            mode: "light",
            catalogEditable: false,
        });

        expect(root.querySelector("[data-token-filter]")).toBeNull();
        expect(
            Array.from(root.querySelectorAll<HTMLElement>("[data-token-id]"), (item) => item.dataset.tokenId),
        ).toEqual(["album-caption-font", "album-shadow"]);
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
