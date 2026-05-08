/**
 * Parses the `value=` (single-mode) / `values=` (multi-mode) attribute pair
 * into a unified array. Multi-mode wins when both are present.
 */
export function parseValues(el: HTMLElement): string[] {
    const raw = el.getAttribute("values");
    if (raw) return raw.split(",").map(s => s.trim()).filter(Boolean);
    const v = el.getAttribute("value") || "";
    return v ? [v] : [];
}

/** UI labels (one per value). Falls back to the values themselves when absent. */
export function parseLabels(el: HTMLElement, values: string[]): string[] {
    const raw = el.getAttribute("labels");
    if (raw) return raw.split(",").map(s => s.trim());
    return values;
}

/** Where the floating Unpin button (single-mode) sits relative to the editor. */
export function parsePlacement(el: HTMLElement): "left" | "right" | "top" | "bottom" {
    const v = el.getAttribute("placement");
    return (v === "right" || v === "top" || v === "bottom") ? v : "left";
}
