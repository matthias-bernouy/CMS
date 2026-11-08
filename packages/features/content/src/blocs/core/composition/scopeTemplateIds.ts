const SINGLE_ID_REFERENCES = [
    "aria-activedescendant",
    "aria-details",
    "aria-errormessage",
    "commandfor",
    "for",
    "form",
    "list",
    "popovertarget",
] as const;
const ID_LIST_REFERENCES = [
    "aria-controls",
    "aria-describedby",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
    "headers",
] as const;

export type TemplateIdScope = {
    readonly counters: Map<string, number>;
    readonly used: Set<string>;
};

export function createTemplateIdScope(root: ParentNode): TemplateIdScope {
    return {
        counters: new Map(),
        used: new Set(Array.from(root.querySelectorAll<HTMLElement>("[id]"), (element) => element.id)),
    };
}

/** Keep generated Light DOM ids unique while preserving the first readable id. */
export function scopeTemplateIds(fragment: DocumentFragment, scope: TemplateIdScope): void {
    const remapped = new Map<string, string>();
    for (const element of Array.from(fragment.querySelectorAll<HTMLElement>("[id]"))) {
        const original = element.id;
        if (!scope.used.has(original)) {
            scope.used.add(original);
            continue;
        }
        const next = nextId(original, scope);
        element.id = next;
        remapped.set(original, next);
    }
    if (remapped.size === 0) {
        return;
    }
    for (const element of Array.from(fragment.querySelectorAll<HTMLElement>("*"))) {
        rewriteSingleReferences(element, remapped);
        rewriteReferenceLists(element, remapped);
        rewriteLocalFragment(element, remapped);
    }
}

function nextId(original: string, scope: TemplateIdScope): string {
    let counter = scope.counters.get(original) ?? 1;
    let candidate: string;
    do {
        counter += 1;
        candidate = `${original}--cms-${counter}`;
    } while (scope.used.has(candidate));
    scope.counters.set(original, counter);
    scope.used.add(candidate);
    return candidate;
}

function rewriteSingleReferences(element: HTMLElement, remapped: ReadonlyMap<string, string>): void {
    for (const attribute of SINGLE_ID_REFERENCES) {
        const current = element.getAttribute(attribute);
        const replacement = current ? remapped.get(current) : undefined;
        if (replacement) {
            element.setAttribute(attribute, replacement);
        }
    }
}

function rewriteReferenceLists(element: HTMLElement, remapped: ReadonlyMap<string, string>): void {
    for (const attribute of ID_LIST_REFERENCES) {
        const current = element.getAttribute(attribute);
        if (!current) {
            continue;
        }
        const next = current
            .trim()
            .split(/\s+/u)
            .map((id) => remapped.get(id) ?? id)
            .join(" ");
        element.setAttribute(attribute, next);
    }
}

function rewriteLocalFragment(element: HTMLElement, remapped: ReadonlyMap<string, string>): void {
    const href = element.getAttribute("href");
    if (!href?.startsWith("#")) {
        return;
    }
    let target = href.slice(1);
    try {
        target = decodeURIComponent(target);
    } catch {
        return;
    }
    const replacement = remapped.get(target);
    if (replacement) {
        element.setAttribute("href", `#${encodeURIComponent(replacement)}`);
    }
}
