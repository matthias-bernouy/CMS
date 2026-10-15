import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import type { Page } from "playwright";
import { assertMaximum } from "../benchmark";

export const BINDING_CORE = join(
    import.meta.dir,
    "../../../packages/features/cms-content/src/runtime-assets/generated/binding-core.js",
);

export async function reportBundleSize(): Promise<void> {
    const bytes = await Bun.file(BINDING_CORE).bytes();
    const sizes = {
        raw: bytes.byteLength,
        gzip: gzipSync(bytes).byteLength,
        brotli: brotliCompressSync(bytes).byteLength,
    };
    console.log("\nBinding bundle bytes", sizes);
    assertMaximum("raw binding bundle", sizes.raw, 200_000);
    assertMaximum("gzip binding bundle", sizes.gzip, 80_000);
}

export async function memoryMetrics(page: Page): Promise<{ domNodes: number; usedJsHeapBytes: number }> {
    await page.requestGC();
    return page.evaluate(() => {
        const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
        return { domNodes: document.querySelectorAll("*").length, usedJsHeapBytes: memory.memory?.usedJSHeapSize ?? 0 };
    });
}

export async function reportMemory(page: Page, baseline: Awaited<ReturnType<typeof memoryMetrics>>): Promise<void> {
    const metrics = await memoryMetrics(page);
    console.log("\n1,000-row retained footprint", {
        domNodes: metrics.domNodes - baseline.domNodes,
        usedJsHeapBytes: metrics.usedJsHeapBytes - baseline.usedJsHeapBytes,
    });
}
