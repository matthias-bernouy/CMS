import { isValidCustomElementTag } from "@bernouy/cms-content";
import { RESERVED_PREFIXES } from "@bernouy/cms-content";

/**
 * Inputs passed to `validateBloc`. All source fields are optional —
 * server-side calls may have only the JS source available, CLI calls have
 * the full bloc folder. The validator runs whichever checks the inputs support.
 */
export type ValidateBlocInput = {
    /** Manifest tag — required, the only mandatory field. */
    tag: string;
    /** User's view source (typically `Bloc.ts`). */
    viewSource?: string;
    /** User's editor source (typically `BlocEditor.ts`). */
    editorSource?: string;
};

export type ValidateBlocResult = {
    errors: string[];
};


/**
 * Bloc-specific tag check: format-valid custom-element name AND not in a
 * system-reserved prefix. Returns `null` when the tag is acceptable, an
 * error string otherwise.
 */
export function validateBlocTag(tag: string): string | null {
    if (!isValidCustomElementTag(tag)) {
        return `Invalid tag "${tag}" — must be a lowercase custom-element name (e.g. "my-card").`;
    }
    for (const prefix of RESERVED_PREFIXES) {
        if (tag.startsWith(prefix)) {
            return `Tag "${tag}" uses reserved prefix "${prefix}*" — pick another name.`;
        }
    }
    return null;
}

/**
 * Orchestrator. Runs every check the inputs support and returns the
 * combined result. Missing optional inputs produce a warning so callers
 * know coverage is partial.
 */
export function validateBloc(input: ValidateBlocInput): ValidateBlocResult {
    const errors: string[] = [];

    const tagError = validateBlocTag(input.tag);
    if (tagError) errors.push(tagError);

    if (input.viewSource) {
        errors.push(...checkNoHardcodedDefine(input.viewSource, "Bloc",       input.tag));
        errors.push(...checkNoLocationMutation(input.viewSource, "Bloc"));
    }
    if (input.editorSource) {
        errors.push(...checkNoHardcodedDefine(input.editorSource, "BlocEditor", input.tag));
        errors.push(...checkNoLocationMutation(input.editorSource, "BlocEditor"));
    }

    return { errors };
}

// ── #3: Hardcoded `customElements.define` ─────────────────────────────────

/**
 * Bloc registration is owned by the build wrapper, which stamps in the
 * manifest tag via `BE5_TAG_TO_BE_REPLACED`. After build the placeholder
 * is substituted, so the bundle always contains exactly one legitimate
 * `customElements.define("<expected-tag>", …)`. We reject any literal
 * that doesn't match the expected tag (means the author hardcoded a
 * different tag) and any duplicate (means the author added their own
 * call on top of the wrapper's — would crash with "already defined").
 */
function checkNoHardcodedDefine(source: string, fileLabel: string, expectedTag: string): string[] {
    const errors: string[] = [];
    const re = /customElements\.define\s*\(\s*["']([^"']*)["']/g;
    let match: RegExpExecArray | null;
    let expectedSeen = 0;
    while ((match = re.exec(source)) !== null) {
        const literal = match[1]!;
        if (literal === "BE5_TAG_TO_BE_REPLACED") continue;
        if (literal === expectedTag) {
            expectedSeen++;
            if (expectedSeen > 1) {
                errors.push(
                    `${fileLabel}: duplicate \`customElements.define("${literal}", …)\` — the build wrapper already registers the bloc, remove the extra call.`,
                );
            }
            continue;
        }
        errors.push(
            `${fileLabel}: hardcoded \`customElements.define("${literal}", …)\` — bloc registration is handled by the build wrapper, remove this call.`,
        );
    }
    return errors;
}

// ── #6: Direct `Location` mutation ────────────────────────────────────────

/**
 * Browsers refuse runtime overrides of `location.assign`, `location.replace`
 * and the `location.href` setter. The editor consequently has no way to
 * intercept blocs that mutate `location.*` directly: such blocs navigate away
 * mid-edit, losing the user's work.
 *
 * We reject the mutation patterns at push time and steer authors toward
 * `<a href>` (static nav) or `history.pushState` (SPA-style transitions),
 * both of which the editor DOES intercept. See cms-bloc-development.md
 * rule 9 for the full pattern guide.
 */
function checkNoLocationMutation(source: string, fileLabel: string): string[] {
    const PATTERNS: { name: string; re: RegExp }[] = [
        { name: "location.href = …",         re: /\blocation\s*\.\s*href\s*=/g },
        { name: "window.location.href = …",  re: /\bwindow\s*\.\s*location\s*\.\s*href\s*=/g },
        { name: "location.assign(…)",        re: /\blocation\s*\.\s*assign\s*\(/g },
        { name: "location.replace(…)",       re: /\blocation\s*\.\s*replace\s*\(/g },
        { name: "window.location = …",       re: /\bwindow\s*\.\s*location\s*=(?!=)/g },
    ];
    const errors: string[] = [];
    for (const { name, re } of PATTERNS) {
        if (re.test(source)) {
            errors.push(
                `${fileLabel}: \`${name}\` detected — Location mutations bypass the editor (browser blocks our intercept). Use \`<a href="…">\` for static navigation or \`history.pushState(...)\` for SPA-style transitions.`,
            );
        }
    }
    return errors;
}
