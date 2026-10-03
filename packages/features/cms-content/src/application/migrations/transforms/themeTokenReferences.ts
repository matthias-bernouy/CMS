const TOKEN_SUFFIX = "(?![a-z0-9-])";

export function replaceThemeTokenReference(value: string, from: string, to: string): string {
    if (value === from) {
        return to;
    }
    return value.replace(new RegExp(`--${escapeRegExp(from)}${TOKEN_SUFFIX}`, "gu"), `--${to}`);
}

export function referencesThemeToken(value: string, tokenId: string): boolean {
    return value === tokenId || new RegExp(`--${escapeRegExp(tokenId)}${TOKEN_SUFFIX}`, "u").test(value);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
