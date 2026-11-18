/** Controlled collection contributions, compiled and admitted before Registry publication. */
export function settingsSources() {
    const files = {
        "theme/definition.json": { label: "bloc.label", categories: ["colors"] },
        "theme/colors.json": {
            id: "colors",
            label: "bloc.label",
            entries: [
                { id: "accent", label: "bloc.label", type: "color", defaults: { light: "#123456", dark: "#abcdef" } },
            ],
        },
        "texts/definitions/content.json": [
            { id: "greeting", label: "bloc.label", category: "bloc.label", group: "bloc.label" },
        ],
        "texts/locales/en/content.json": { greeting: "Original greeting" },
        "texts/locales/fr/content.json": { greeting: "Bonjour" },
    };
    return Object.entries(files).map(([path, content]) => ({ path, content: JSON.stringify(content) }));
}
