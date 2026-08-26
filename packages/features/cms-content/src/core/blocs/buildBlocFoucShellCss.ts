/**
 * Keeps server-rendered Light DOM visible while Bloc custom elements upgrade.
 * Undefined hosts become layout-transparent instead of cloaking the document,
 * so content remains readable when a runtime asset is delayed or unavailable.
 */
export function buildBlocFoucShellCss(usedTags: readonly string[]): string {
    if (usedTags.length === 0) {
        return "";
    }

    const undefinedBlocs = usedTags.map((tag) => `${tag}:not(:defined)`).join(",");
    return `${undefinedBlocs}{display:contents}`;
}
