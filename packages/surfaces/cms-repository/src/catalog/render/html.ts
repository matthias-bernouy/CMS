import { escapeAttr, escapeHtml } from "@bernouy/http-runner/html";
import { formatBytes, humanLabel } from "../view/presentation";

export { escapeAttr, escapeHtml, formatBytes, humanLabel };

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
