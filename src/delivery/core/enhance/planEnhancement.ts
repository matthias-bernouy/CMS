import type { ImageMeasurement } from "src/delivery/core/enhance/PlaywrightSession";
import { computeSrcset } from "src/delivery/core/enhance/computeSrcset";
import { classifyImages } from "src/delivery/core/enhance/classifyImage";
import { isOptimizable, type ImageRewrite } from "src/delivery/core/enhance/rewriteHTML";
import type { VariantSpec } from "src/delivery/interfaces/VariantSpec";

export type EnhancementPlan = {
    /** Per-`<img>` rewrite instructions (index-aligned with the DOM). */
    rewrites: ImageRewrite[];
    /** Deduplicated list of variants the rewrites depend on. The same
     *  `(originalUrl, width)` produced by several rewrites only appears
     *  once. */
    variantsNeeded: VariantSpec[];
};

/**
 * Pure planning step: from Playwright measurements + the media ladder,
 * decide which images need srcset rungs, what `sizes` to emit, and whether
 * to force `loading` / `fetchpriority`. No I/O — same input, same output.
 *
 * Both the runtime enhancer (writes back to delivery cache) and the build
 * pipeline (uploads variants then HTML to a CDN) consume this plan. The
 * runtime path then resolves variant URLs via `formatImageUrl`; the build
 * path materializes them via `VariantGenerator` and resolves to the CDN's
 * `absoluteURL`.
 */
export function planEnhancement(
    measurements: readonly ImageMeasurement[],
    ladder: readonly number[],
    viewportHeight: number,
): EnhancementPlan {
    const classifications = classifyImages(measurements, viewportHeight);
    const rewrites: ImageRewrite[] = [];
    const variantsByKey = new Map<string, VariantSpec>();

    for (const m of measurements) {
        const classification = classifications.get(m.index);
        let widths: number[] = [];
        let sizes = "";

        if (isOptimizable(m.src) && m.naturalWidth > 0) {
            const opt = computeSrcset(m.perViewport, m.naturalWidth, ladder);
            widths = opt.widths;
            sizes  = opt.sizes;
        }

        if (widths.length === 0 && !classification) continue;

        rewrites.push({
            index: m.index,
            widths,
            sizes,
            ...(classification ? {
                loading: classification.loading,
                fetchpriority: classification.fetchpriority,
            } : {}),
        });

        for (const w of widths) {
            const key = `${m.src} ${w}`;
            if (!variantsByKey.has(key)) {
                variantsByKey.set(key, { originalUrl: m.src, width: w });
            }
        }
    }

    return { rewrites, variantsNeeded: [...variantsByKey.values()] };
}
