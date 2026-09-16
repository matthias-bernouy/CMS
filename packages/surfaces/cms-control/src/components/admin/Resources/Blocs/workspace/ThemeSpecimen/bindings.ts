import type { PreviewToken } from "./model";

const PREVIEW_BINDINGS = [
    ["--spec-page", "page", "#f7f7f5"],
    ["--spec-surface", "surface", "#ffffff"],
    ["--spec-subtle", "subtle", "#f1f2ef"],
    ["--spec-heading", "heading", "#20231f"],
    ["--spec-body", "body", "#41463f"],
    ["--spec-muted", "muted", "#737970"],
    ["--spec-border", "border", "#dfe2dc"],
    ["--spec-primary", "accent", "#16634d"],
    ["--spec-primary-foreground", "accent-foreground", "#ffffff"],
    ["--spec-primary-muted", "accent-muted", "#e2f0ea"],
    ["--spec-primary-contrasted", "accent-contrasted", "#164534"],
    ["--spec-secondary", "secondary", "#e7eee9"],
    ["--spec-secondary-foreground", "secondary-foreground", "#17362c"],
    ["--spec-info", "info", "#e8f2ff"],
    ["--spec-success", "success", "#e7f5eb"],
    ["--spec-warning", "warning", "#fff1cf"],
    ["--spec-danger", "danger", "#fde9e7"],
    ["--spec-font-body", "font-body", "system-ui, sans-serif"],
    ["--spec-font-heading", "font-heading", "Georgia, serif"],
    ["--spec-radius", "radius", "12px"],
    ["--spec-shadow", "shadow", "0 12px 32px rgb(0 0 0 / 8%)"],
] as const;

export function applyPreviewBindings(
    panel: HTMLElement,
    bindings: Record<string, string>,
    tokens: Map<string, PreviewToken>,
): void {
    for (const [property, slot, fallback] of PREVIEW_BINDINGS) {
        const token = tokens.get(bindings[slot] ?? "");
        panel.style.setProperty(property, token ? `var(--${token.variable}, ${fallback})` : fallback);
    }
}
