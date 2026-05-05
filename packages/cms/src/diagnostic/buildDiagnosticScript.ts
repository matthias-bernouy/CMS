import { join } from "node:path";

/**
 * Source of the diagnostic agent. Compiled to a single IIFE and served as
 * a static asset by `registerDiagnostic` — never inlined, so the page CSP
 * (`default-src 'self'`) covers it without needing a hash or a nonce.
 */
const SOURCE = join(import.meta.dir, "diagnostic.client.ts");

let cached: string | null = null;

/**
 * Build the diagnostic agent IIFE once and return the source. Memoized at
 * module scope: the bundle is identical across requests, recomputing on
 * every render would defeat the point of having a cheap opt-in switch.
 */
export async function buildDiagnosticScript(): Promise<string> {
    if (cached) return cached;
    const result = await Bun.build({
        entrypoints: [SOURCE],
        format:      "iife",
        minify:      true,
        target:      "browser",
    });
    cached = await result.outputs[0]!.text();
    return cached;
}
