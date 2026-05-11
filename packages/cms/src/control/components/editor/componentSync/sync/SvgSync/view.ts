import { resolveTarget } from "./target";
import type { SvgSync } from "./SvgSync";

/**
 * Render the picker card into the host's shadow. Stamps the layout once
 * and seeds the preview from the current slotted SVG (or the inline
 * template if the default hasn't been seeded yet, e.g. eager-prepare
 * before component mount).
 */
export function render(host: SvgSync) {
    const shadow = host.shadowRoot!;
    Array.from(shadow.children).forEach(c => { if (c.tagName !== "STYLE") c.remove(); });

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = host.getAttribute("label") || "Icon";

    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("part", "card");

    host._preview = document.createElement("div");
    host._preview.className = "preview";
    host._preview.setAttribute("part", "preview");

    const action = document.createElement("span");
    action.className = "action";
    action.textContent = "Click to swap…";

    card.appendChild(host._preview);
    card.appendChild(action);
    card.addEventListener("click", () => host.openMediaCenter());

    host._error = document.createElement("div");
    host._error.className = "error";
    host._error.setAttribute("part", "error");
    host._error.hidden = true;

    shadow.appendChild(label);
    shadow.appendChild(card);
    shadow.appendChild(host._error);

    updatePreview(host);
}

/**
 * Refresh the preview to mirror what the user actually sees: clone the
 * current slotted SVG. If none exists yet (rare — happens during the
 * window between `prepare` and `syncDefault`), fall back to the inline
 * `<p9r-svg-sync>` child template so the panel is never empty.
 */
export function updatePreview(host: SvgSync) {
    if (!host._preview) return;
    host._preview.innerHTML = "";
    const live = resolveTarget(host);
    const source = live ?? host.querySelector("svg");
    if (source) {
        host._preview.appendChild(source.cloneNode(true));
    } else {
        const empty = document.createElement("div");
        empty.className = "empty";
        host._preview.appendChild(empty);
    }
}
