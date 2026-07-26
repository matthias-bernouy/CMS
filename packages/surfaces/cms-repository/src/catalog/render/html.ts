import { escapeAttr, escapeHtml } from "@bernouy/http-runner/html";

export { escapeAttr, escapeHtml };

export function humanLabel(value: string): string {
    return value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll("-", " ")
        .replace(/^./, (first) => first.toUpperCase());
}

export function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) {
        return "Size unavailable";
    }
    if (bytes < 1_024) {
        return `${bytes} B`;
    }
    if (bytes < 1_024 * 1_024) {
        return `${(bytes / 1_024).toFixed(1)} KiB`;
    }
    return `${(bytes / (1_024 * 1_024)).toFixed(1)} MiB`;
}

export function selected(value: string, expected: string): string {
    return value === expected ? " selected" : "";
}

export function renderBreadcrumbs(items: readonly Readonly<{ label: string; href?: string }>[] = []): string {
    return `<nav aria-label="Breadcrumb"><ol>${items
        .map(({ label, href }) =>
            href
                ? `<li><a href="${escapeAttr(href)}">${escapeHtml(label)}</a></li>`
                : `<li aria-current="page">${escapeHtml(label)}</li>`,
        )
        .join("")}</ol></nav>`;
}

export function renderStatusBadges(stable: boolean, latest: boolean): string {
    const badges = [
        stable ? '<span class="catalog-badge">Stable</span>' : "",
        latest ? '<span class="catalog-badge">Latest</span>' : "",
    ];
    return badges.filter(Boolean).join(" ");
}
