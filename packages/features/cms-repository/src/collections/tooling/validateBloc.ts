import { collectionBlocTagIssue } from "cms-repository/collections/core/namespace";

/**
 * Inputs passed to `validateBloc`. The view source is optional —
 * server-side calls may have only the JS source available, CLI calls have
 * the full bloc folder. The validator runs whichever checks the inputs support.
 */
export type ValidateBlocInput = {
    /** Stable collection Bloc identity. */
    tag: string;
    /** User's view source (typically `Bloc.ts`). */
    viewSource?: string;
};

export type ValidateBlocResult = {
    errors: string[];
};

/**
 * Bloc-specific identity check: valid namespaced ID and not in a
 * system-reserved prefix. Returns `null` when the tag is acceptable, an
 * error string otherwise.
 */
export function validateBlocTag(tag: string): string | null {
    const issue = collectionBlocTagIssue(tag);
    return issue ? `Invalid collection Bloc tag "${tag}": ${issue}.` : null;
}

/**
 * Orchestrator. Runs every check the inputs support and returns the
 * combined result. Missing optional inputs produce a warning so callers
 * know coverage is partial.
 */
export function validateBloc(input: ValidateBlocInput): ValidateBlocResult {
    const errors: string[] = [];

    const tagError = validateBlocTag(input.tag);
    if (tagError) {
        errors.push(tagError);
    }

    if (input.viewSource) {
        errors.push(...checkNoCustomElementRegistration(input.viewSource, "Bloc"));
        errors.push(...checkNoShadowDom(input.viewSource, "Bloc"));
        errors.push(...checkNoLocationMutation(input.viewSource, "Bloc"));
    }
    return { errors };
}

function checkNoShadowDom(source: string, fileLabel: string): string[] {
    if (!/\battachShadow\s*\(|\.\s*shadowRoot\b/u.test(source)) {
        return [];
    }
    return [`${fileLabel}: Shadow DOM APIs are forbidden — mount behavior on the native \`cms-bloc\` root.`];
}

function checkNoCustomElementRegistration(source: string, fileLabel: string): string[] {
    if (!/(?:\bwindow\s*\.\s*)?\bcustomElements\s*\.\s*define\s*\(/u.test(source)) {
        return [];
    }
    return [
        `${fileLabel}: \`customElements.define(…)\` is forbidden — export \`mount(root)\` or a \`BlocBehavior\` controller instead.`,
    ];
}

// ── #6: Direct `Location` mutation ────────────────────────────────────────

/**
 * Browsers refuse runtime overrides of `location.assign`, `location.replace`
 * and the `location.href` setter. The authoring surface consequently has no way
 * to intercept Blocs that mutate `location.*` directly: such Blocs navigate
 * away from the current workflow.
 *
 * We reject the mutation patterns at push time and steer authors toward
 * `<a href>` (static nav) or `history.pushState` (SPA-style transitions),
 * both of which the site shell can intercept.
 */
function checkNoLocationMutation(source: string, fileLabel: string): string[] {
    const PATTERNS: { name: string; re: RegExp }[] = [
        { name: "location.href = …", re: /\blocation\s*\.\s*href\s*=/g },
        { name: "window.location.href = …", re: /\bwindow\s*\.\s*location\s*\.\s*href\s*=/g },
        { name: "location.assign(…)", re: /\blocation\s*\.\s*assign\s*\(/g },
        { name: "location.replace(…)", re: /\blocation\s*\.\s*replace\s*\(/g },
        { name: "window.location = …", re: /\bwindow\s*\.\s*location\s*=(?!=)/g },
    ];
    const errors: string[] = [];
    for (const { name, re } of PATTERNS) {
        if (re.test(source)) {
            errors.push(
                `${fileLabel}: \`${name}\` detected — Location mutations bypass the site shell (browser blocks its intercept). Use \`<a href="…">\` for static navigation or \`history.pushState(...)\` for SPA-style transitions.`,
            );
        }
    }
    return errors;
}
