/**
 * Returns true when the element is visually hidden — display:none /
 * visibility:hidden / opacity:0 (own or any flat-tree ancestor) or
 * positioned outside the viewport.
 *
 * Uses `Element.checkVisibility()` because it walks the rendering tree
 * (flat tree, post slot-projection), not the light-DOM `parentElement`
 * chain. Critical for slotted-into-shadow patterns: an editor target
 * lives in light DOM but its visual context (a `<div style="opacity:0">`
 * wrapping a `<slot>`) lives in the parent bloc's shadow root. A manual
 * `parentElement` walk never crosses that boundary; `checkVisibility`
 * does.
 *
 * Geometry-based "off-viewport" cases (`transform: translateX(-9999px)`,
 * `top: -9999px`) are caught separately via the rect check —
 * `checkVisibility` only considers style, not position.
 *
 * `checkVisibility` is supported in Chrome 105+, Safari 17.4+, Firefox
 * 125+ — well within the admin's modern-browser target. We feature-test
 * defensively and pass both option-name variants
 * (`checkOpacity` / `checkVisibilityCSS` and
 * `opacityProperty` / `visibilityProperty`) so engines on either side of the
 * rename accept the call.
 */
export function isVisuallyInvisible(el: HTMLElement | SVGElement): boolean {
    if (typeof el.checkVisibility === "function") {
        const visible = el.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
            checkOpacity: true,
            checkVisibilityCSS: true,
        } as CheckVisibilityOptions);
        if (!visible) return true;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true;
    if (r.bottom <= 0 || r.right <= 0 || r.left >= innerWidth || r.top >= innerHeight) return true;
    return false;
}
