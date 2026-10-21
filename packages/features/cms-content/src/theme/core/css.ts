import type { ThemeMode, ThemeSettings, ThemeToken } from "cms-content/theme/interfaces/theme";
import { allTokens } from "cms-content/theme/core/tokens";

export function generateThemeCss(settings: ThemeSettings | undefined): string {
    if (!settings) {
        return "";
    }
    const theme = settings.themes.find((item) => item.id === settings.activeThemeId);
    if (!theme) {
        return "";
    }
    const tokens = allTokens(settings);
    const light = declarations(theme.values.light, tokens, "light");
    const dark = declarations(theme.values.dark, tokens, "dark");
    const chunks: string[] = [];
    const fontFaces = settings.sources.flatMap((source) => source.fontFaces ?? []);
    if (fontFaces.length) {
        chunks.push(
            fontFaces
                .map(
                    (face) => `@font-face {
  font-family: "${face.family}";
  src: url("${face.source}") format("woff2");
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: ${face.display};
}`,
                )
                .join("\n\n"),
        );
    }
    if (light) {
        chunks.push(`:root {\n${light}\n}`);
    }
    if (dark) {
        chunks.push(`@media (prefers-color-scheme: dark) {\n  :root {\n${indent(dark, "  ")}\n  }\n}`);
        chunks.push(`:root[data-theme-mode="dark"] {\n${dark}\n}`);
    }
    return chunks.join("\n\n");
}

function declarations(values: Record<string, string>, tokens: ThemeToken[], mode: ThemeMode): string {
    return tokens
        .flatMap((token) => {
            const value = values[token.id] ?? token.defaults?.[mode];
            return value?.trim() ? [`  --${token.variable}: ${value.trim()};`] : [];
        })
        .join("\n");
}

function indent(value: string, prefix: string): string {
    return value
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
}
