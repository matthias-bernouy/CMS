import type { ThemeSettings } from "cms-content/interfaces/theme";
import { allTokens } from "cms-content/core/theme/tokens";

export function generateThemeCss(settings: ThemeSettings | undefined): string {
    if (!settings) return "";
    const theme = settings.themes.find((item) => item.id === settings.activeThemeId);
    if (!theme) return "";
    const variables = new Map(allTokens(settings).map((item) => [item.id, item.variable]));
    const light = declarations(theme.values.light, variables);
    const dark = declarations(theme.values.dark, variables);
    const chunks: string[] = [];
    if (light) chunks.push(`:root {\n${light}\n}`);
    if (dark) {
        chunks.push(`@media (prefers-color-scheme: dark) {\n  :root {\n${indent(dark, "  ")}\n  }\n}`);
        chunks.push(`:root[data-theme-mode="dark"] {\n${dark}\n}`);
    }
    return chunks.join("\n\n");
}

function declarations(values: Record<string, string>, variables: Map<string, string>): string {
    return Object.entries(values).flatMap(([id, value]) => {
        const variable = variables.get(id);
        return variable && value.trim() ? [`  --${variable}: ${value.trim()};`] : [];
    }).join("\n");
}

function indent(value: string, prefix: string): string {
    return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}
