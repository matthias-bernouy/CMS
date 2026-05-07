import { classifyLink } from "./classifyLink";
import { getEditorContext, setActiveLink } from "./editorContext";

/**
 * Document-level capture listener that catches every click on an `<a>`
 * regardless of how deep it sits in the shadow tree. Click events are
 * `composed`, so they bubble out across shadow boundaries; we walk
 * `event.composedPath()` to find the anchor and:
 *   - on plain click, publish it as the editor's active link (the floating
 *     `<cms-link-bar>` listens via `onActiveLinkChange` and renders);
 *   - on `Cmd/Ctrl + click`, fire the primary action immediately, no UI;
 *   - on click outside any anchor, clear the active link.
 *
 * Per-tag editors via ObserverManager don't work for this: they only see
 * elements ObserverManager walks, which stops at shadow roots of bloc
 * custom elements. Most real links in a published page (navbar logo,
 * step-card CTAs, snippet links, etc.) live inside those shadows.
 *
 * Returns an `uninstall` callback so EditorRoot can disconnect on tear-down.
 */
export function installLinkInterceptor(): () => void {
    const ensureLinkBar = (): void => {
        if (document.querySelector("cms-link-bar")) return;
        const bar = document.createElement("cms-link-bar");
        document.body.appendChild(bar);
    };

    const findAnchor = (e: Event): HTMLAnchorElement | null => {
        for (const n of e.composedPath()) {
            if (n instanceof HTMLAnchorElement) return n;
        }
        return null;
    };

    const onClick = (e: MouseEvent) => {
        const anchor = findAnchor(e);
        if (!anchor) {
            // Click outside any link clears the active state. Clicks on the
            // bar's own buttons stopPropagation, so they don't reach here.
            setActiveLink(null);
            return;
        }
        const href = anchor.getAttribute("href") || "";

        // Modifier keys → primary action straight away, no bar.
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const ctx = getEditorContext();
            const cls = classifyLink(href, location.origin, ctx.knownPagePaths);
            ctx.requestNavigation({ href, classification: cls, via: "modifier-click" });
            return;
        }

        // Plain click — block default navigation, publish active link.
        // We do NOT stopPropagation: inner editors (TextEditor on text,
        // SvgEditor on inline icons) still receive the click and activate
        // normally.
        e.preventDefault();
        ensureLinkBar();
        setActiveLink(anchor);
    };

    document.addEventListener("click", onClick, true);

    return () => {
        document.removeEventListener("click", onClick, true);
        document.querySelector("cms-link-bar")?.remove();
        setActiveLink(null);
    };
}
