import type { ThemeDefinition, ThemeSettings, ThemeSource } from "cms-content/interfaces/theme";

export function defaultThemeSettings(): ThemeSettings {
    const sources: ThemeSource[] = [
        source("custom", "Site variables", true, [
            category(
                "variables",
                "Variables",
                "Variables created by this site and reusable by installed integrations.",
            ),
        ]),
    ];
    const theme: ThemeDefinition = {
        id: "default",
        name: "Default theme",
        values: { light: {}, dark: {} },
    };
    return { activeThemeId: theme.id, sources, themes: [theme] };
}

function source(id: string, label: string, supportsModes: boolean, categories: ThemeSource["categories"]): ThemeSource {
    return { id, label, supportsModes, categories };
}

function category(id: string, label: string, description: string): ThemeSource["categories"][number] {
    return { id, label, description, tokens: [] };
}
