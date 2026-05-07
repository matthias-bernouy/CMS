import { classifyLink } from "src/control/core/editorSystem/classifyLink";
import {
    getActiveLink,
    getEditorContext,
    type LinkClassification,
} from "src/control/core/editorSystem/editorContext";

const SECTION_CLASS = "bag-link-section";

/**
 * Stamps (or removes) the link section inside the BAG host. Called after
 * `renderActionBar` and on every `activeLink` change. Idempotent — checks
 * the existing section's `data-href` to skip work when the active link
 * hasn't changed since the last render.
 *
 * The section is a plain inline group (icon + href + primary button)
 * appended after the regular action buttons, separated by a left border
 * and an accent color. Visually distinct from the bloc actions but
 * physically inside the same toolbar — one floating UI to chase, less
 * z-index roulette.
 */
export function mountLinkSection(host: HTMLElement): void {
    const link = getActiveLink();
    const existing = host.querySelector<HTMLElement>(`.${SECTION_CLASS}`);

    if (!link) {
        existing?.remove();
        return;
    }

    const href = link.getAttribute("href") || "";
    if (existing?.dataset["href"] === href) return; // unchanged

    const cls = classifyLink(href, location.origin, getEditorContext().knownPagePaths);
    const node = renderSection(href, cls);
    if (existing) existing.replaceWith(node);
    else          host.appendChild(node);
}

function renderSection(href: string, cls: LinkClassification): HTMLElement {
    const root = document.createElement("div");
    root.className = SECTION_CLASS;
    root.dataset["href"] = href;

    // Section is slotted into BAG's shadow — its own descendants can't be
    // styled from there (`::slotted()` only matches the slotted element
    // itself). We carry our styles inline on the section's own light tree.
    const styleEl = document.createElement("style");
    styleEl.textContent = SECTION_CSS;
    root.appendChild(styleEl);

    const { label, icon } = primaryActionLabel(cls);

    const iconEl = document.createElement("span");
    iconEl.className = "icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = "🔗";

    const hrefEl = document.createElement("span");
    hrefEl.className = "href";
    hrefEl.textContent = href || "(empty)";
    hrefEl.title       = href;

    const action = document.createElement("button");
    action.type = "button";
    action.textContent = `${icon} ${label}`;
    action.dataset["kind"] = cls.kind;
    action.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ctx = getEditorContext();
        const c   = classifyLink(href, location.origin, ctx.knownPagePaths);
        ctx.requestNavigation({ href, classification: c, via: "popover-action" });
    });

    root.append(iconEl, hrefEl, action);
    return root;
}

const SECTION_CSS = `
.${SECTION_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
    padding-left: 10px;
    border-left: 1px solid var(--border-default, #e2e8f0);
    font-size: 12px;
    vertical-align: middle;
}
.${SECTION_CLASS} > .icon {
    color: var(--primary-base, #4361ee);
    font-size: 13px;
    line-height: 1;
}
.${SECTION_CLASS} > .href {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-body, #334155);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
}
.${SECTION_CLASS} > button {
    cursor: pointer;
    border: 1px solid transparent;
    background: var(--primary-muted, #eef2ff);
    color: var(--primary-base, #4361ee);
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    line-height: 1.2;
}
.${SECTION_CLASS} > button:hover {
    border-color: var(--primary-base, #4361ee);
}
`;

function primaryActionLabel(cls: LinkClassification): { label: string; icon: string } {
    switch (cls.kind) {
        case "page":     return { label: "Edit page",       icon: "↗" };
        case "anchor":   return { label: "Scroll",          icon: "↓" };
        case "asset":    return { label: "Open in new tab", icon: "↗" };
        case "external": return { label: "Open in new tab", icon: "↗" };
        case "mailto":   return { label: "Open",            icon: "↗" };
        case "empty":    return { label: "—",               icon: "" };
    }
}
