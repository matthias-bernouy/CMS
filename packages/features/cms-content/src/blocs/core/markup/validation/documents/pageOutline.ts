import { ContentValidationError } from "cms-content/application/core/validation/errors";

type OutlineState = {
    readonly h1Count: number;
    readonly previousLevel?: number;
};

/** Validates every reachable semantic outline after compositions have expanded. */
export function validateExpandedPageOutline(root: ParentNode): void {
    walkNodes(Array.from(root.children), [{ h1Count: 0 }]);
}

function walkNodes(nodes: readonly Element[], initial: readonly OutlineState[]): readonly OutlineState[] {
    let states = initial;
    for (const node of nodes) {
        states = walkElement(node, states);
    }
    return states;
}

function walkElement(element: Element, incoming: readonly OutlineState[]): readonly OutlineState[] {
    if (element.hasAttribute("cms-repeat") && containsH1(element)) {
        throw new ContentValidationError("content", "expanded Page h1 cannot be repeated");
    }

    let active = applyHeading(element, incoming);
    if (element.hasAttribute("cms-match")) {
        const cases = Array.from(element.children).filter((child) => child.hasAttribute("cms-case"));
        active = cases.length > 0 ? mergeStates(cases.flatMap((branch) => walkElement(branch, active))) : active;
    } else {
        active = walkNodes(Array.from(element.children), active);
    }

    return element.hasAttribute("cms-condition") ? mergeStates([...incoming, ...active]) : active;
}

function applyHeading(element: Element, states: readonly OutlineState[]): readonly OutlineState[] {
    if (!/^h[1-6]$/u.test(element.localName)) {
        return states;
    }
    const level = Number(element.localName.slice(1));
    return states.map((state) => {
        const h1Count = state.h1Count + (level === 1 ? 1 : 0);
        if (h1Count > 1) {
            throw new ContentValidationError("content", "expanded Page may contain at most one h1 in any branch");
        }
        if (state.previousLevel !== undefined && level > state.previousLevel + 1) {
            throw new ContentValidationError(
                "content",
                `expanded Page heading hierarchy skips from h${state.previousLevel} to h${level}`,
            );
        }
        return { h1Count, previousLevel: level };
    });
}

function containsH1(element: Element): boolean {
    return element.localName === "h1" || Boolean(element.querySelector("h1"));
}

function mergeStates(states: readonly OutlineState[]): readonly OutlineState[] {
    return [
        ...new Map(
            states.map((state) => [`${state.h1Count}:${state.previousLevel ?? "none"}`, state] as const),
        ).values(),
    ];
}
