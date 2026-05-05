import type { ImageMeasurement, ViewportLayout } from "src/delivery/core/enhance/PlaywrightSession";
import { VIEWPORT_WIDTHS } from "src/delivery/core/enhance/viewports";

export type ImageClassification = {
    /** `loading="lazy"` is emitted when the image is below the fold on every
     *  measured viewport. Otherwise we force `eager` to undo any default the
     *  original HTML shipped with. */
    loading: "lazy" | "eager";
    /** `fetchpriority="high"` is only ever set on ONE image per page — the
     *  largest above-the-fold image at the smallest viewport where anything
     *  is visible (the LCP candidate on mobile, which is what CWV measures). */
    fetchpriority: "high" | "auto";
};

/**
 * Decide `loading` + `fetchpriority` for every measured image on the page.
 *
 * Rules:
 *  - `loading: "lazy"` when the image is below-the-fold (or invisible) at
 *    every measured viewport. A 0-width rect counts as invisible.
 *  - `loading: "eager"` otherwise. We always emit an explicit value so the
 *    optimized HTML isn't at the mercy of whatever default the bloc shipped.
 *  - `fetchpriority: "high"` on exactly one image — the largest by rendered
 *    area among those above the fold at the smallest viewport that has any
 *    visible image (usually 320). This matches Chrome's LCP heuristic on
 *    mobile, which is what Core Web Vitals scores against.
 */
export function classifyImages(
    measurements: readonly ImageMeasurement[],
    viewportHeight: number,
): Map<number, ImageClassification> {
    const result = new Map<number, ImageClassification>();

    for (const m of measurements) {
        const everAboveFold = m.perViewport.some(pv => isAboveFold(pv, viewportHeight));
        result.set(m.index, {
            loading: everAboveFold ? "eager" : "lazy",
            fetchpriority: "auto",
        });
    }

    // LCP candidate: walk viewports from smallest to largest, stop at the
    // first viewport with at least one above-fold image, pick the largest.
    for (const vw of VIEWPORT_WIDTHS) {
        let bestIdx = -1;
        let bestArea = 0;
        for (const m of measurements) {
            const pv = m.perViewport.find(p => p.viewport === vw);
            if (!pv || !isAboveFold(pv, viewportHeight)) continue;
            const area = pv.cssWidth * pv.height;
            if (area > bestArea) {
                bestArea = area;
                bestIdx = m.index;
            }
        }
        if (bestIdx >= 0) {
            const entry = result.get(bestIdx)!;
            result.set(bestIdx, { ...entry, fetchpriority: "high" });
            break;
        }
    }

    return result;
}

function isAboveFold(pv: ViewportLayout, viewportHeight: number): boolean {
    if (pv.cssWidth <= 0 || pv.height <= 0) return false;
    // Rect must intersect the initial viewport rectangle.
    return pv.top < viewportHeight && pv.top + pv.height > 0;
}
