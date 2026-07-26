import type { ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

export function themeSettingsFromCss(css: string): ThemeSettings {
    const values: Record<string, string> = {};
    const tokens: ThemeToken[] = [];
    const seen = new Set<string>();
    for (const match of css.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;{}]+)\s*;/gi)) {
        const variable = match[1]!.toLowerCase();
        if (seen.has(variable)) {
            continue;
        }
        seen.add(variable);
        const value = match[2]!.trim();
        tokens.push({
            id: variable,
            variable,
            label: variable.split("-").map(capitalize).join(" "),
            description: `Existing --${variable} variable`,
            type: inferredTokenType(variable, value),
        });
        values[variable] = value;
    }
    assignReferencedTokenTypes(tokens, values);
    return {
        activeThemeId: "imported",
        sources: [siteTokensSource(), importedCssSource(tokens)],
        themes: [{ id: "imported", name: "Imported theme", values: { light: values, dark: {} } }],
    };
}

function assignReferencedTokenTypes(tokens: ThemeToken[], values: Record<string, string>): void {
    const byVariable = new Map(tokens.map((token) => [token.variable, token]));
    const resolving = new Set<string>();
    const resolve = (token: ThemeToken): void => {
        if (resolving.has(token.id)) {
            return;
        }
        resolving.add(token.id);
        const reference = /^\s*var\(\s*--([a-z][a-z0-9-]*)/i.exec(values[token.id] ?? "")?.[1]?.toLowerCase();
        const target = reference ? byVariable.get(reference) : undefined;
        if (target && target.id !== token.id) {
            resolve(target);
            token.type = target.type;
        }
        resolving.delete(token.id);
    };
    tokens.forEach(resolve);
}

function siteTokensSource(): ThemeSettings["sources"][number] {
    return {
        id: "site-tokens",
        label: "Site tokens",
        supportsModes: true,
        owner: { kind: "site" },
        categories: [
            { id: "general", label: "General", description: "Design tokens created for this site.", tokens: [] },
        ],
    };
}

function importedCssSource(tokens: ThemeToken[]): ThemeSettings["sources"][number] {
    return {
        id: "imported-css",
        label: "Imported CSS",
        supportsModes: false,
        owner: { kind: "site" },
        categories: [
            {
                id: "general",
                label: "Imported variables",
                description: "Variables preserved from the former free-form stylesheet.",
                tokens,
            },
        ],
    };
}

function inferredTokenType(variable: string, value: string): ThemeTokenType {
    if (/^(font-family|font-(heading|body))(-|$)/.test(variable)) {
        return "font-family";
    }
    if (/^(shadow|ctx-shadow)(-|$)/.test(variable)) {
        return "shadow";
    }
    if (/^(font-size|space|gap|padding|margin|radius|width|height|size)(-|$)/.test(variable)) {
        return "length";
    }
    return looksLikeColor(value) ? "color" : "value";
}

function capitalize(value: string): string {
    return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function looksLikeColor(value: string): boolean {
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lab\(|lch\(|color\(|transparent$|currentcolor$)/i.test(value);
}
