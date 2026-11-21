import { invalid } from "email-templates/core/errors";

export const tokenPattern = /\{\{([A-Za-z][A-Za-z0-9_]{0,63})\}\}/gu;
export function tokens(source: string): string[] {
    const names = [...source.matchAll(tokenPattern)].map((match) => match[1]!);
    const remainder = source.replace(tokenPattern, "");
    if (remainder.includes("{{") || remainder.includes("}}")) {
        invalid();
    }
    return names;
}
export function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
export function validUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            ["https:", "http:"].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !/[\u0000-\u0020\u007f]/u.test(value)
        );
    } catch {
        return false;
    }
}
