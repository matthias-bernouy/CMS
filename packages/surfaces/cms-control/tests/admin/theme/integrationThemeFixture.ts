import type { ThemeSettings } from "@bernouy/cms-content";

export function integrationThemeEditorRoot(): ShadowRoot {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
        <span data-source-title></span>
        <div data-theme-switch></div>
        <div data-editor-context><div data-category-actions><button data-add-theme-category></button><button data-add-element></button><button data-delete-category></button></div></div>
        <button data-save-theme></button><button data-activate-theme></button><span data-theme-status></span>
        <input data-theme-name-input><div data-mode-switch></div>
        <section data-category-section></section>
        <div data-groups></div>
        <div data-category-fields><input data-category-label-input><input data-category-description-input></div>
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
                                id: "integration-photo-albums-font",
                                variable: "integration-photo-albums-font",
                                label: "Gallery font",
                                description: "Titles and captions",
                                type: "font-family",
                                defaults: { light: "Inter, system-ui, sans-serif", dark: "system-ui, sans-serif" },
                            },
                            {
                                id: "integration-photo-albums-accent",
                                variable: "integration-photo-albums-accent",
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
                                id: "integration-photo-albums-shadow",
                                variable: "integration-photo-albums-shadow",
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
                    light: { "integration-photo-albums-font": "var(--font-body)" },
                    dark: {},
                },
            },
        ],
    };
}
