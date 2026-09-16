export type PreviewToken = { variable: string; light: string; dark: string };

const VARIABLE = /^[a-z][a-z0-9-]*$/;

export function readPreviewBindings(raw: string | null): Record<string, string> {
    const value = parseJson(raw, {});
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return Object.fromEntries(
        Object.entries(value).filter(
            (entry): entry is [string, string] =>
                VARIABLE.test(entry[0]) && typeof entry[1] === "string" && VARIABLE.test(entry[1]),
        ),
    );
}

export function readPreviewTokens(raw: string | null): PreviewToken[] {
    const value = parseJson(raw, []);
    return Array.isArray(value) ? value.filter(isPreviewToken) : [];
}

export function readPreviewVariables(raw: string | null): Set<string> {
    const value = parseJson(raw, []);
    return new Set(
        Array.isArray(value)
            ? value.filter((variable): variable is string => typeof variable === "string" && VARIABLE.test(variable))
            : [],
    );
}

function parseJson(raw: string | null, fallback: unknown): unknown {
    try {
        return JSON.parse(raw ?? JSON.stringify(fallback));
    } catch {
        return fallback;
    }
}

function isPreviewToken(value: unknown): value is PreviewToken {
    if (!value || typeof value !== "object") {
        return false;
    }
    const token = value as Partial<PreviewToken>;
    return Boolean(
        token.variable &&
            VARIABLE.test(token.variable) &&
            typeof token.light === "string" &&
            typeof token.dark === "string",
    );
}
