import { type EnhancementPlan, planEnhancement } from "src/delivery/core/enhance/planEnhancement";
import type { PlaywrightSession } from "src/delivery/core/enhance/PlaywrightSession";
import { VIEWPORT_HEIGHT } from "src/delivery/core/enhance/viewports";

export type BuildEnhancerOptions = {
    session: PlaywrightSession;
    /** Same `imageConfig.ladderWidths` the runtime uses — the authoritative
     *  list of widths the storage backend can serve. */
    ladder: readonly number[];
};

/**
 * Serves a single page HTML over a throw-away local server, points
 * Playwright at it to measure every `<img>` at every viewport, and runs
 * the (pure) `planEnhancement` step. Returns the plan the
 * `DeliveryBuilder` consumes to produce variants and rewrite the HTML.
 *
 * Asset URLs in the page are already absolute (CDN), so Playwright fetches
 * them from the real CDN during measurement — no need to proxy them
 * through the temp server. The throw-away server only serves the page
 * itself; everything else returns 404 (best-effort, doesn't block).
 *
 * Distinct pages can run in parallel because each `enhance` call gets its
 * own server on a random port; the shared `PlaywrightSession` handles the
 * concurrency at the browser context level.
 */
export class BuildEnhancer {
    constructor(private _opts: BuildEnhancerOptions) {}

    async enhance(path: string, html: string): Promise<EnhancementPlan> {
        const normalizedPath = path === "" ? "/" : path;
        const server = Bun.serve({
            port: 0,
            fetch: (req) => {
                const url = new URL(req.url);
                if (url.pathname === normalizedPath) {
                    return new Response(html, {
                        status: 200,
                        headers: { "Content-Type": "text/html; charset=utf-8" },
                    });
                }
                return new Response(null, { status: 404 });
            },
        });

        try {
            const origin = `http://localhost:${server.port}`;
            const measurements = await this._opts.session.measureImages(`${origin}${normalizedPath}`);
            if (!measurements || measurements.length === 0) {
                return { rewrites: [], variantsNeeded: [] };
            }
            return planEnhancement(measurements, this._opts.ladder, VIEWPORT_HEIGHT);
        } finally {
            server.stop();
        }
    }
}
