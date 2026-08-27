/**
 * Keeps authored content hidden until every Bloc used by the document has
 * registered its custom element. The selectors stay scoped to known Bloc tags
 * so unknown or reserved custom elements cannot cloak the page forever.
 */
export function buildBlocFoucShellCss(usedTags: readonly string[]): string {
    if (usedTags.length === 0) {
        return "";
    }

    const htmlSelector = usedTags.map((tag) => `html:has(${tag}:not(:defined))`).join(",");
    const bodySelector = usedTags.map((tag) => `html:has(${tag}:not(:defined)) body`).join(",");
    return `${htmlSelector}{background:#fff}${bodySelector}{visibility:hidden}`;
}
