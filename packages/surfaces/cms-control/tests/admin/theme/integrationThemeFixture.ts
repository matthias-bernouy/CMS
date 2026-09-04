import type { ThemeSettings } from "@bernouy/cms-content";

export function integrationThemeEditorRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
        <span data-source-title></span>
        <div data-theme-switch></div>
        <div data-editor-context></div>
        <button data-save-theme></button><button data-activate-theme></button><span data-theme-status></span>
        <div data-mode-switch></div><span data-mode-note></span>
        <section data-category-section></section>
        <div data-groups></div>
    `;
    return root;
}

export function integrationThemeFixture(): ThemeSettings {
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
                        description: "Gallery presentation.",
                        tokens: [
                            {
                                id: "photo-albums-font",
                                variable: "photo-albums-font",
                                label: "Gallery font",
                                description: "Titles and captions",
                                type: "font-family",
                                defaults: { light: "Inter, system-ui, sans-serif", dark: "system-ui, sans-serif" },
                            },
                            {
                                id: "photo-albums-accent",
                                variable: "photo-albums-accent",
                                label: "Gallery accent",
                                description: "Selected media",
                                type: "color",
                                defaults: { light: "#336699" },
                            },
                        ],
                    },
                    {
                        id: "viewer",
                        label: "Viewer",
                        description: "Viewer presentation.",
                        tokens: [
                            {
                                id: "photo-albums-shadow",
                                variable: "photo-albums-shadow",
                                label: "Viewer shadow",
                                description: "Full-screen viewer depth",
                                type: "shadow",
                                defaults: { light: "0 1rem 3rem rgb(0 0 0 / 20%)" },
                            },
                        ],
                    },
                ],
            },
        ],
        themes: [
            {
                id: "default",
                name: "Default",
                values: {
                    light: { "photo-albums-font": "var(--font-body)" },
                    dark: {},
                },
            },
        ],
    };
}
