import { BIND_STOP_ATTR } from "@bernouy/cms-blocs/binding";
import { CONTENT_REGION_ATTR } from "cms-control/core/editorSystem/contentRegionAttrs";

const CONTENT_REGION_SELECTOR = `[${CONTENT_REGION_ATTR}]`;

/**
 * The editor canvas wraps the page in a `[cms-bind-stop]` region; for a PAGE
 * that region further contains the composed Shell with a `[data-cms-content]`
 * marker at the `{{CONTENT}}` slot. These two pure helpers locate the page's
 * OWN content inside that wrapper and decide whether it's empty — shared by
 * `EditorRoot.pageContent` (save harvest) and `_isWorkingEmpty` (new-page
 * template picker) so both agree on what "the content" is, and so the logic is
 * unit-testable without booting the editor.
 */

/**
 * The content region inside the canvas wrapper: for a page it's the
 * `[data-cms-content]` marker (the Shell's `{{CONTENT}}` slot); for a
 * template/snippet (no Shell) it's the `[cms-bind-stop]` element itself.
 * `null` when no wrapper is present (canvas not composed yet).
 */
export function findContentRegion(assigned: Element[]): Element | null {
    const stop = assigned.find(el => el.hasAttribute(BIND_STOP_ATTR));
    return stop?.querySelector(CONTENT_REGION_SELECTOR) ?? stop ?? null;
}

/**
 * True when `region` holds no authored content — nothing, or the single empty
 * `<p>` (optionally `<p><br></p>`) a freshly-created page starts with. Drives
 * the template picker on new pages. Must look INSIDE the region: the wrapper
 * element itself is never the empty `<p>`, so checking the slotted wrapper
 * directly would wrongly report a blank page as non-empty.
 */
export function isRegionEmpty(region: Element | null): boolean {
    if (!region) return true;
    const nodes = Array.from(region.childNodes).filter(n =>
        n.nodeType === Node.ELEMENT_NODE ||
        (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "")
    );
    if (nodes.length === 0) return true;
    if (nodes.length !== 1 || nodes[0]!.nodeType !== Node.ELEMENT_NODE) return false;
    const el = nodes[0] as Element;
    if (el.tagName !== "P") return false;
    if ((el.textContent ?? "").trim() !== "") return false;
    const onlyBr = el.children.length === 1 && el.children[0]!.tagName === "BR";
    return el.children.length === 0 || onlyBr;
}

/**
 * Inject a picked template's HTML into the canvas. When the content region
 * exists (the normal case — the cms-bind-stop / Shell wrapper), replace ONLY its
 * inner content so the wrapper survives — `findContentRegion` (save harvest +
 * empty check) relies on it; destroying it would orphan the save (persist "").
 * Fallback (no wrapper composed): replace `host`'s default-slotted children,
 * keeping named slots (style / script / configuration) intact.
 */
export function applyPickedTemplate(host: Element, region: Element | null, html: string): void {
    if (region) {
        region.innerHTML = html;
        return;
    }
    Array.from(host.children).forEach(c => { if (!c.hasAttribute("slot")) c.remove(); });
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    while (tmp.firstChild) host.appendChild(tmp.firstChild);
}
