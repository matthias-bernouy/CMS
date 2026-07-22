export type Point = { label: string; value: number };

const FR = new Intl.NumberFormat("fr-FR");
const DTF = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export const esc = (s: string): string =>
    s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));

const compact = (n: number): string =>
    n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));

/** Format a value for display. int → fr thousands; ms → "N ms"; pct → fraction→"N,N %". PURE. */
export function formatValue(n: number, format: string): string {
    if (format === "ms") {
        return `${Math.round(n)} ms`;
    }
    if (format === "pct") {
        return `${(n * 100).toFixed(1).replace(".", ",")} %`;
    }
    return FR.format(Math.round(n));
}

/** ISO date → short fr label ("2 juin"); falls back to the raw string. PURE. */
export const fmtDate = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : DTF.format(d);
};

/** Empty-state block: a faint chart icon + title (+ hint). PURE. */
export function emptyHtml(title: string, hint?: string): string {
    return (
        `<div class="empty"><svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">` +
        `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>` +
        `<p class="empty-title">${esc(title)}</p>${hint ? `<p class="empty-hint">${esc(hint)}</p>` : ""}</div>`
    );
}

/** SVG area+line+dots chart with light axes (max/0 + first/last labels). PURE. */
export function lineSvg(points: Point[]): string {
    if (points.length === 0) {
        return "";
    }
    const W = 320,
        H = 140,
        ML = 32,
        MR = 8,
        MT = 10,
        MB = 22;
    const pw = W - ML - MR,
        ph = H - MT - MB,
        baseY = MT + ph;
    const max = Math.max(...points.map((p) => p.value), 1);
    const n = points.length;
    const xy = points.map(
        (p, i) => [ML + (n === 1 ? pw / 2 : (i / (n - 1)) * pw), MT + (1 - p.value / max) * ph] as const,
    );
    const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${xy[0]![0].toFixed(1)},${baseY} ${line} ${xy[n - 1]![0].toFixed(1)},${baseY}`;
    const dots = xy.map(([x, y]) => `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`).join("");
    return (
        `<svg class="line" viewBox="0 0 ${W} ${H}" role="img">` +
        `<defs><linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1"><stop class="grad-top" offset="0%"/><stop class="grad-bottom" offset="100%"/></linearGradient></defs>` +
        `<line class="axis" x1="${ML}" y1="${MT}" x2="${ML}" y2="${baseY}"/><line class="axis" x1="${ML}" y1="${baseY}" x2="${W - MR}" y2="${baseY}"/>` +
        `<text class="tick" x="${ML - 4}" y="${MT + 3}" text-anchor="end">${compact(max)}</text>` +
        `<text class="tick" x="${ML - 4}" y="${baseY}" text-anchor="end">0</text>` +
        `<polygon class="area" points="${area}" fill="url(#lc-grad)"/><polyline class="stroke" points="${line}"/>${dots}` +
        `<text class="tick" x="${ML}" y="${H - 6}">${esc(points[0]!.label)}</text>` +
        `<text class="tick" x="${W - MR}" y="${H - 6}" text-anchor="end">${esc(points[n - 1]!.label)}</text></svg>`
    );
}

/** Horizontal bars (width = share of total). showCount → "N · P,P %", else "P,P %". PURE. */
export function barsHtml(points: Point[], showCount: boolean): string {
    if (points.length === 0) {
        return "";
    }
    const total = points.reduce((s, p) => s + p.value, 0) || 1;
    return points
        .map((p) => {
            const pct = (p.value / total) * 100;
            const pctStr = `${pct.toFixed(1).replace(".", ",")} %`;
            return (
                `<div class="bar"><span class="bar-key" title="${esc(p.label)}">${esc(p.label)}</span>` +
                `<svg class="bar-svg" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect height="8" width="${pct.toFixed(1)}"/></svg>` +
                `<span class="bar-val">${showCount ? `${formatValue(p.value, "int")} · ${pctStr}` : pctStr}</span></div>`
            );
        })
        .join("");
}
