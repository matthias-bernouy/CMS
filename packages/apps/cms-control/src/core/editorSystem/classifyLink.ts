import type { LinkClassification } from "./editorContext";

const SPECIAL_SCHEMES = ["mailto:", "tel:", "sms:"];
const ASSET_PREFIXES  = ["/uploads/", "/assets/", "/api/", "/.cms/", "/_storage/"];

/**
 * Categorize a raw `href` so consumers (LinkEditor click handler,
 * LinkPopover button label, navigationGuard) can pick the right action.
 *
 * Pure function — no DOM, no I/O. The current origin and the set of
 * known internal page paths are passed in so the same logic can be
 * unit-tested.
 */
export function classifyLink(
    href: string,
    currentOrigin: string,
    knownPagePaths: Set<string>,
): LinkClassification {
    const trimmed = href.trim();

    if (!trimmed || trimmed === "#" || /^javascript:/i.test(trimmed)) {
        return { kind: "empty", target: trimmed };
    }

    if (trimmed.startsWith("#")) {
        return { kind: "anchor", target: trimmed.slice(1) };
    }

    if (SPECIAL_SCHEMES.some(s => trimmed.toLowerCase().startsWith(s))) {
        return { kind: "mailto", target: trimmed };
    }

    let url: URL;
    try {
        url = new URL(trimmed, currentOrigin);
    } catch {
        return { kind: "empty", target: trimmed };
    }

    const sameOrigin = url.origin === currentOrigin;

    if (!sameOrigin) {
        return { kind: "external", target: url.href };
    }

    // Same origin — distinguish CMS page from raw asset.
    const path = url.pathname;
    if (knownPagePaths.has(path)) {
        return { kind: "page", target: path };
    }
    if (ASSET_PREFIXES.some(p => path.startsWith(p))) {
        return { kind: "asset", target: url.href };
    }
    // Same-origin path that doesn't match any known page nor asset prefix.
    // Treat as page (the user probably typed the path of a draft) rather
    // than asset — at worst the editor will 404 cleanly.
    return { kind: "page", target: path };
}
