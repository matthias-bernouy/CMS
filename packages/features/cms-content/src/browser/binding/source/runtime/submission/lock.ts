const locks = new WeakSet<Element>();
const guardedEvents = [
    "beforeinput",
    "click",
    "keydown",
    "pointerdown",
    "mousedown",
    "touchstart",
    "paste",
    "cut",
    "drop",
    "dragstart",
    "wheel",
    "submit",
];

/** Lock user editing without disabling form values, moving focus or changing layout. */
export function lockEditing(scope: Element, form: HTMLFormElement): (() => void) | null {
    if (locks.has(scope)) {
        return null;
    }
    locks.add(scope);
    const busy = scope.getAttribute("aria-busy");
    scope.setAttribute("aria-busy", "true");
    const owns = (element: Element) =>
        scope.contains(element) || form.contains(element) || (element as HTMLInputElement).form === form;
    const guard = (event: Event) => {
        const path = event.composedPath();
        if (!path.some((node) => node instanceof Element && owns(node))) {
            return;
        }
        if (
            !path.some(
                (node) =>
                    node instanceof Element &&
                    node.matches(
                        "input, textarea, select, button, [role=button], [contenteditable], [draggable=true], form",
                    ),
            )
        ) {
            return;
        }
        const key = event as KeyboardEvent;
        if (
            event.type === "keydown" &&
            (key.key === "Tab" || ((key.ctrlKey || key.metaKey) && ["c", "a"].includes(key.key.toLowerCase())))
        ) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    for (const event of guardedEvents) {
        scope.ownerDocument.addEventListener(event, guard, { capture: true, passive: false });
    }
    return () => {
        locks.delete(scope);
        if (busy === null) {
            scope.removeAttribute("aria-busy");
        } else {
            scope.setAttribute("aria-busy", busy);
        }
        for (const event of guardedEvents) {
            scope.ownerDocument.removeEventListener(event, guard, true);
        }
    };
}
