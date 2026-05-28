/**
 * Resolves which element the floating action bar should position itself
 * against AND listen for hover on.
 *
 * By default the anchor is the target element itself. An Editor subclass can
 * override `getActionBarAnchor()` to return any HTMLElement (typically inside
 * its component's shadow DOM) — BAG then positions relative to it and binds
 * mouseenter/mouseleave to it, so the bar only shows while that sub-element
 * is hovered. Returning `null` keeps the default target behavior.
 */
export type ActionBarAnchor = { rect: DOMRect; element: HTMLElement };

export interface AnchorEditor {
    getActionBarAnchor?(): HTMLElement | null;
}

export function resolveActionBarAnchor(
    target: HTMLElement,
    editor?: AnchorEditor | null,
): ActionBarAnchor {
    const element = editor?.getActionBarAnchor?.() ?? target;
    return { rect: element.getBoundingClientRect(), element };
}
