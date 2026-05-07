import { isValidCustomElementTag } from "src/socle/utils/validation";

/**
 * Inputs passed to `validateBloc`. All HTML/source fields are optional —
 * server-side calls may have only the JS source available, CLI calls have
 * the full bloc folder. The validator runs whichever checks the inputs
 * support and reports which were skipped via `warnings`.
 */
export type ValidateBlocInput = {
    /** Manifest tag — required, the only mandatory field. */
    tag: string;
    /** User's view source (typically `Bloc.ts`). */
    viewSource?: string;
    /** User's editor source (typically `BlocEditor.ts`). */
    editorSource?: string;
    /** Bloc shadow DOM template — declares `<slot name="…">`. */
    templateHtml?: string;
    /** Editor configuration panel — declares `<p9r-…-sync>`. */
    configurationHtml?: string;
};

export type ValidateBlocResult = {
    errors:   string[];
    warnings: string[];
};

/** Reserved custom-element prefixes — system-only, never bloc tags. */
const RESERVED_TAG_PREFIXES = ["w13c-", "p9r-"] as const;

/**
 * Bloc-specific tag check: format-valid custom-element name AND not in a
 * system-reserved prefix. Returns `null` when the tag is acceptable, an
 * error string otherwise.
 */
export function validateBlocTag(tag: string): string | null {
    if (!isValidCustomElementTag(tag)) {
        return `Invalid tag "${tag}" — must be a lowercase custom-element name (e.g. "my-card").`;
    }
    for (const prefix of RESERVED_TAG_PREFIXES) {
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
    const warnings: string[] = [];

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

    if (input.configurationHtml) {
        errors.push(...checkCompSyncNonEmpty(input.configurationHtml));
        errors.push(...checkSyncRequiredAttrs(input.configurationHtml));
    } else {
        warnings.push("configurationHtml not provided — comp-sync and sync-attribute checks skipped.");
    }

    if (input.configurationHtml && input.templateHtml) {
        errors.push(...checkSlotConsistency(input.configurationHtml, input.templateHtml));
    } else if (input.configurationHtml && !input.templateHtml) {
        warnings.push("templateHtml not provided — slot-consistency check skipped.");
    }

    return { errors, warnings };
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
 * `Location.prototype` members are `[[LegacyUnforgeable]]` per WebIDL — the
 * browser refuses every runtime override of `location.assign`,
 * `location.replace` and `location.href` setter. The editor consequently
 * has no way to intercept blocs that mutate `location.*` directly: such
 * blocs navigate away mid-edit, losing the user's work.
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

// ── #1: Empty `<p9r-comp-sync>` ───────────────────────────────────────────

/**
 * `<p9r-comp-sync>` with no element children causes runtime crashes in the
 * editor (per the documented rule in `cms-bloc-development.md`). Whitespace
 * and comments are tolerated — only an absence of element children is rejected.
 */
function checkCompSyncNonEmpty(html: string): string[] {
    const errors: string[] = [];
    const re = /<p9r-comp-sync\b[^>]*>([\s\S]*?)<\/p9r-comp-sync>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
        const inner = match[1]!.replace(/<!--[\s\S]*?-->/g, "").trim();
        if (inner === "" || !/</.test(inner)) {
            errors.push(`<p9r-comp-sync> must contain at least one child element.`);
        }
    }
    return errors;
}

// ── #5: Required attributes on sync elements ──────────────────────────────

const REQUIRED_SYNC_ATTRS: Record<string, string[]> = {
    "p9r-link": ["name"],
};

function checkSyncRequiredAttrs(html: string): string[] {
    const errors: string[] = [];
    for (const [tag, required] of Object.entries(REQUIRED_SYNC_ATTRS)) {
        const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
        let match: RegExpExecArray | null;
        while ((match = re.exec(html)) !== null) {
            const attrsBlob = match[1] ?? "";
            for (const attr of required) {
                const attrRe = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, "i");
                const m = attrsBlob.match(attrRe);
                if (!m || m[1]!.trim() === "") {
                    errors.push(`<${tag}> requires non-empty "${attr}" attribute.`);
                }
            }
        }
    }
    return errors;
}

// ── #4: Slot consistency ──────────────────────────────────────────────────

/**
 * Collect every slot name declared in `template.html`. The default slot
 * (`<slot>` without `name`) is represented by the empty string.
 */
function collectTemplateSlots(templateHtml: string): Set<string> {
    const slots = new Set<string>();
    const re = /<slot\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(templateHtml)) !== null) {
        const nameMatch = (match[1] ?? "").match(/\bname\s*=\s*["']([^"']*)["']/i);
        slots.add(nameMatch ? nameMatch[1]! : "");
    }
    return slots;
}

/**
 * HTML void elements — start tags that imply their own close. Needed so the
 * depth tracker in `findDirectChildren` doesn't over-count when a void
 * appears among `<p9r-comp-sync>` children.
 */
const VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img",
    "input", "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Tiny tag scanner that returns immediate-children opening tags only —
 * descendants are skipped via a depth counter. We need this because slot
 * attributes carried by transplanted-children are addressed to the parent
 * bloc's template; attributes on grandchildren refer to a different bloc's
 * slots and must NOT be checked here.
 */
function findDirectChildren(html: string): Array<{ tag: string; attrs: string }> {
    const out: Array<{ tag: string; attrs: string }> = [];
    let i = 0;
    let depth = 0;

    while (i < html.length) {
        const lt = html.indexOf("<", i);
        if (lt === -1) break;
        i = lt;

        if (html.startsWith("<!--", i)) {
            const end = html.indexOf("-->", i + 4);
            i = end === -1 ? html.length : end + 3;
            continue;
        }

        if (html[i + 1] === "/") {
            const end = html.indexOf(">", i);
            if (end === -1) break;
            depth--;
            i = end + 1;
            continue;
        }

        const end = html.indexOf(">", i);
        if (end === -1) break;
        const inside = html.slice(i + 1, end);
        const explicitlySelfClosing = inside.endsWith("/");
        const tagMatch = inside.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
        if (tagMatch) {
            const tag = tagMatch[1]!.toLowerCase();
            const attrs = inside.slice(tagMatch[1]!.length).replace(/\/$/, "");
            if (depth === 0) out.push({ tag, attrs });
            if (!explicitlySelfClosing && !VOID_TAGS.has(tag)) depth++;
        }
        i = end + 1;
    }
    return out;
}

/**
 * Walk the configuration to find every slot reference and assert that it
 * resolves to a declared slot in the template. Two reference points:
 *   - direct children of `<p9r-comp-sync>` carrying `slot="…"` (default if omitted)
 *   - `<p9r-image-sync slotTarget="…">` (default if omitted or empty)
 *
 * Only DIRECT children of `<p9r-comp-sync>` matter — `slot=` on a deeper
 * descendant addresses a different bloc's shadow tree.
 */
function checkSlotConsistency(configurationHtml: string, templateHtml: string): string[] {
    const errors: string[] = [];
    const declared = collectTemplateSlots(templateHtml);

    const compSyncRe = /<p9r-comp-sync\b[^>]*>([\s\S]*?)<\/p9r-comp-sync>/gi;
    let match: RegExpExecArray | null;
    while ((match = compSyncRe.exec(configurationHtml)) !== null) {
        for (const child of findDirectChildren(match[1]!)) {
            const slotMatch = child.attrs.match(/\bslot\s*=\s*["']([^"']*)["']/i);
            const slotName = slotMatch ? slotMatch[1]! : "";
            if (!declared.has(slotName)) {
                errors.push(
                    `<p9r-comp-sync> child targets slot "${slotName}" but template.html declares no matching <slot${slotName ? ` name="${slotName}"` : ""}>.`,
                );
            }
        }
    }

    const imageSyncRe = /<p9r-image-sync\b([^>]*?)\/?>/gi;
    while ((match = imageSyncRe.exec(configurationHtml)) !== null) {
        const slotMatch = (match[1] ?? "").match(/\bslotTarget\s*=\s*["']([^"']*)["']/i);
        if (!slotMatch) continue;
        const slotName = slotMatch[1]!;
        if (!declared.has(slotName)) {
            errors.push(
                `<p9r-image-sync slotTarget="${slotName}"> but template.html declares no matching <slot name="${slotName}">.`,
            );
        }
    }

    return errors;
}
