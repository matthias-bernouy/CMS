export function validateForbiddenBlocBehavior(source: string, label: string): readonly string[] {
    const errors: string[] = [];
    if (/(?:\bwindow\s*\.\s*)?\bcustomElements\s*\.\s*define\s*\(/u.test(source)) {
        errors.push(`${label}: \`customElements.define(…)\` is forbidden — export a \`mount(root)\` function instead.`);
    }
    if (/\battachShadow\s*\(|\.\s*shadowRoot\b/u.test(source)) {
        errors.push(`${label}: Shadow DOM APIs are forbidden — mount behavior on the native \`cms-bloc\` root.`);
    }
    if (
        /\bcreateElementNS\s*\(\s*["'`]http:\/\/www\.w3\.org\/2000\/svg["'`]/u.test(source) ||
        /\bcreateElement\s*\(\s*["'`]svg["'`]/u.test(source) ||
        /<svg(?:\s|>)/iu.test(source)
    ) {
        errors.push(
            `${label}: programmatic SVG markup is forbidden — declare an empty \`<svg cms-svg="…">\` backed by an admitted asset.`,
        );
    }
    const locationMutations: readonly [name: string, pattern: RegExp][] = [
        ["location.href = …", /\blocation\s*\.\s*href\s*=/u],
        ["window.location.href = …", /\bwindow\s*\.\s*location\s*\.\s*href\s*=/u],
        ["location.assign(…)", /\blocation\s*\.\s*assign\s*\(/u],
        ["location.replace(…)", /\blocation\s*\.\s*replace\s*\(/u],
        ["window.location = …", /\bwindow\s*\.\s*location\s*=(?!=)/u],
    ];
    for (const [name, pattern] of locationMutations) {
        if (pattern.test(source)) {
            errors.push(
                `${label}: \`${name}\` detected — Location mutations bypass the site shell. Use \`<a href="…">\` or \`history.pushState(...)\`.`,
            );
        }
    }
    return errors;
}

export function validateCompiledBlocBehavior(source: string, label: string): readonly string[] {
    const errors = [...validateForbiddenBlocBehavior(source, label)];
    try {
        new Function(source);
    } catch (error) {
        errors.push(
            `${label}: invalid JavaScript (${error instanceof Error ? error.message : "unknown syntax error"}).`,
        );
    }
    return errors;
}
