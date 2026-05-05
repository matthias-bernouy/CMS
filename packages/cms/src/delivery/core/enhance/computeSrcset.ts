import { DPR_MULTIPLIERS } from "src/delivery/core/enhance/viewports";

export type Measurement = { viewport: number; cssWidth: number };

export type ImageOptimization = {
    /** Ladder rungs that should appear in `srcset`, ascending. */
    widths: number[];
    /** Built `sizes` string, or "" when the image was never visible. */
    sizes: string;
};

// Snap an effective pixel count up to the smallest ladder rung that is
// ≥ that count. If we exceed the top of the ladder, return the top —
// the media backend won't enlarge past the ladder cap anyway.
function snapUp(px: number, ladder: readonly number[]): number {
    for (const w of ladder) {
        if (w >= px) return w;
    }
    return ladder[ladder.length - 1]!;
}

function largestLadderAtOrBelow(cap: number, ladder: readonly number[]): number {
    let best = 0;
    for (const w of ladder) {
        if (w <= cap) best = w;
        else break;
    }
    return best;
}

// Round CSS width to a whole pixel — Playwright returns sub-pixel doubles
// from getBoundingClientRect(). Using `ceil` is intentional: a 199.4px
// rendering still wants the 200-px-equivalent rung, never the 100.
function ceilCssWidth(n: number): number {
    return Math.ceil(n);
}

/**
 * Build the (widths, sizes) pair for one image based on what Playwright
 * measured at every viewport. `naturalWidth` caps both the ladder rungs
 * we list (no point requesting `?w=2000` from a 1200px source — the media
 * backend would give back the 1200 anyway) and the per-viewport `sizes`
 * widths (no point telling the browser to budget for more than the source).
 *
 * `ladder` comes from the Socle `MediaUrlBuilder.imageConfig.ladderWidths`
 * — it's the authoritative list of widths the backend is willing to serve.
 * Must be sorted ascending.
 *
 * Inputs that produced 0px (image hidden at that viewport) are dropped.
 * If every viewport produced 0, the function returns empty results so
 * the caller knows to leave the original `<img>` untouched.
 */
export function computeSrcset(
    measurements: readonly Measurement[],
    naturalWidth: number,
    ladder: readonly number[],
): ImageOptimization {
    const visible = measurements.filter(m => m.cssWidth > 0);
    if (visible.length === 0 || naturalWidth <= 0 || ladder.length === 0) {
        return { widths: [], sizes: "" };
    }

    // Collect every (viewport × DPR) effective pixel count, snap to ladder,
    // cap at naturalWidth.
    const widthSet = new Set<number>();
    const ladderCap = largestLadderAtOrBelow(naturalWidth, ladder);
    for (const m of visible) {
        const cssW = ceilCssWidth(m.cssWidth);
        for (const dpr of DPR_MULTIPLIERS) {
            const target = cssW * dpr;
            const snapped = snapUp(target, ladder);
            // If the snapped rung exceeds what the source can deliver, fall
            // back to the largest ladder rung we *can* serve from this image.
            const final = Math.min(snapped, ladderCap);
            if (final > 0) widthSet.add(final);
        }
    }

    const widths = [...widthSet].sort((a, b) => a - b);
    const sizes = buildSizesAttribute(visible, naturalWidth);

    return { widths, sizes };
}

/**
 * Compose the `sizes` attribute. Walk viewports descending and emit
 * `(min-width: Vpx) Wpx,` for each, collapsing runs of equal CSS widths
 * (the higher viewport's media query already covers them). The smallest
 * viewport becomes the no-media-query fallback so the bottom of the
 * range is always covered.
 *
 * Width is also capped at `naturalWidth` so we never tell the browser
 * to budget for more pixels than the source can produce.
 */
function buildSizesAttribute(
    measurements: readonly Measurement[],
    naturalWidth: number,
): string {
    const desc = [...measurements].sort((a, b) => b.viewport - a.viewport);
    const entries: { viewport: number; widthPx: number }[] = [];

    let lastWidth = -1;
    for (const m of desc) {
        const w = Math.min(ceilCssWidth(m.cssWidth), naturalWidth);
        if (w === lastWidth) continue;
        entries.push({ viewport: m.viewport, widthPx: w });
        lastWidth = w;
    }

    if (entries.length === 0) return "";

    // Last (smallest viewport) becomes the fallback. Drop the media-query
    // prefix so `sizes` matches anything below the previous breakpoint.
    const parts: string[] = [];
    for (let i = 0; i < entries.length - 1; i++) {
        parts.push(`(min-width: ${entries[i]!.viewport}px) ${entries[i]!.widthPx}px`);
    }
    parts.push(`${entries[entries.length - 1]!.widthPx}px`);
    return parts.join(", ");
}
