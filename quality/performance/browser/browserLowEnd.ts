import type { Page } from "playwright";
import { assertGrowth, assertMaximum, printResults } from "../benchmark";
import { browserBenchmark, mountBindingRows } from "./browserBinding";

export async function runLowEndBrowserBenchmarks(page: Page): Promise<void> {
    const session = await page.context().newCDPSession(page);
    try {
        await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        const desktop = await browserBenchmark(page, "1,000 rows at desktop CPU", () => mountBindingRows(page, 1_000));
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const midRange = await browserBenchmark(page, "1,000 rows at 4x CPU throttle", () =>
            mountBindingRows(page, 1_000),
        );
        await session.send("Emulation.setCPUThrottlingRate", { rate: 6 });
        const lowEndSmall = await browserBenchmark(page, "100 rows at 6x CPU throttle", () =>
            mountBindingRows(page, 100),
        );
        const lowEndLarge = await browserBenchmark(page, "1,000 rows at 6x CPU throttle", () =>
            mountBindingRows(page, 1_000),
        );
        printResults("Chromium binding under emulated low-end CPUs", [desktop, midRange, lowEndSmall, lowEndLarge]);
        assertMaximum("6x-throttled 1,000-row render p95", lowEndLarge.p95Ms, 10_000);
        assertGrowth("6x-throttled 100 to 1,000 row growth", lowEndSmall, lowEndLarge, 20);
        assertGrowth("desktop to 6x-throttled 1,000-row growth", desktop, lowEndLarge, 20);
    } finally {
        await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await session.detach();
    }
}
