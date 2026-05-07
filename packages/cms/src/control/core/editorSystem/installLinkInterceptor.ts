import type { LinkPopover } from "src/control/components/editor/EditorSystem/LinkPopover/LinkPopover";
import { classifyLink } from "./classifyLink";
import { getEditorContext } from "./editorContext";

/**
 * Document-level capture listener that catches every click on an `<a>`
 * regardless of how deep it sits in the shadow tree. Click events are
 * `composed`, so they bubble out across shadow boundaries; we walk
 * `event.composedPath()` to find the anchor and route the click through
 * the popover (plain) or directly through `requestNavigation` (modifier).
 *
 * Per-tag editors via ObserverManager don't work for this: they only see
 * elements ObserverManager walks, which stops at shadow roots of bloc
 * custom elements. Most real links in a published page (navbar logo,
 * step-card CTAs, snippet links, etc.) live inside those shadows.
 *
 * Returns an `uninstall` callback so EditorRoot can disconnect on tear-down.
 */
export function installLinkInterceptor(): () => void {
    let popover: LinkPopover | null = null;

    const ensurePopover = (): LinkPopover => {
        if (popover) return popover;
        const el = document.createElement("cms-link-popover") as LinkPopover;
        document.body.appendChild(el);
        popover = el;
        return el;
    };

    const findAnchor = (e: Event): HTMLAnchorElement | null => {
        for (const n of e.composedPath()) {
            if (n instanceof HTMLAnchorElement) return n;
        }
        return null;
    };

    const onClick = (e: MouseEvent) => {
        const anchor = findAnchor(e);
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";

        // Modifier keys → fire the primary action immediately, no popover.
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const ctx = getEditorContext();
            const cls = classifyLink(href, location.origin, ctx.knownPagePaths);
            ctx.requestNavigation({ href, classification: cls, via: "modifier-click" });
            return;
        }

        // Plain click — block default navigation, show the popover. We do
        // NOT stopPropagation: inner editors (TextEditor on text, SvgEditor
        // on inline icons) still receive the click and activate normally.
        e.preventDefault();
        ensurePopover().attachTo(anchor);
    };

    document.addEventListener("click", onClick, true);

    return () => {
        document.removeEventListener("click", onClick, true);
        popover?.remove();
        popover = null;
    };
}
