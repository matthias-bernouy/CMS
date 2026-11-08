import type { ContentDiagnostic } from "content/application/interfaces/diagnostics";

export const dynamicValue = (value: string): boolean => /\{\{|#\{|@\{/u.test(value);

type Presence = { branches: Map<Element, Element>; conditions: Set<Element>; repeated: boolean; hidden: boolean };

export function expandedContext(root: HTMLElement, origins?: WeakMap<Element, string>) {
    const elements = Array.from(root.querySelectorAll("*"));
    if (elements.length > 50_000 || root.innerHTML.length > 4 * 1024 * 1024) {
        throw new Error("Expanded document exceeds the authoring analysis budget");
    }
    const presence = new Map<Element, Presence>();
    for (const element of elements) {
        const parent = element.parentElement;
        const previous = parent ? presence.get(parent) : undefined;
        const state: Presence = {
            branches: new Map(previous?.branches),
            conditions: new Set(previous?.conditions),
            repeated: previous?.repeated || element.hasAttribute("cms-repeat"),
            hidden:
                previous?.hidden ||
                (element.hasAttribute("hidden") && !dynamicValue(element.getAttribute("hidden") ?? "")),
        };
        if (parent?.hasAttribute("cms-match") && element.hasAttribute("cms-case")) {
            state.branches.set(parent, element);
        }
        if (element.hasAttribute("cms-condition")) {
            state.conditions.add(element);
        }
        presence.set(element, state);
    }
    const coexist = (a: Element, b: Element): boolean => {
        for (const [match, branch] of presence.get(a)!.branches) {
            const other = presence.get(b)!.branches.get(match);
            if (other && branch !== other) {
                return false;
            }
        }
        return true;
    };
    const certain = (source: Element, target: Element): boolean => {
        const a = presence.get(source)!,
            b = presence.get(target)!;
        return (
            [...b.conditions].every((condition) => a.conditions.has(condition)) &&
            [...b.branches].every(([match, branch]) => a.branches.get(match) === branch) &&
            !b.repeated
        );
    };
    return {
        elements,
        presence,
        coexist,
        certain,
        location: (element: Element, attribute?: string) => diagnosticLocation(element, attribute, origins),
    };
}

export function diagnosticLocation(
    element: Element,
    attribute?: string,
    origins?: WeakMap<Element, string>,
): ContentDiagnostic["location"] {
    const parts: string[] = [];
    let node: Element | null = element;
    while (node && node.localName !== "body" && parts.length < 24) {
        const parent: Element | null = node.parentElement;
        parts.unshift(`${node.localName}[${parent ? Array.from(parent.children).indexOf(node) + 1 : 1}]`);
        node = parent;
    }
    const blocId = origins?.get(element) ?? element.closest("[cms-bloc]")?.getAttribute("cms-bloc");
    return { path: `/${parts.join("/")}`, ...(blocId ? { blocId } : {}), ...(attribute ? { attribute } : {}) };
}

export type ExpandedContext = ReturnType<typeof expandedContext>;
