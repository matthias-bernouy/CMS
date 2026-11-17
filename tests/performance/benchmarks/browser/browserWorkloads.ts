import { chromium } from "playwright";
import { preparePage } from "./browserBinding";
import { runBrowserDiscoveryBenchmarks } from "./browserDiscovery";
import { runBrowserMutationBenchmarks } from "./browserMutations";
import { runBrowserTemplateBenchmarks } from "./browserTemplates";
import { runLowEndBrowserBenchmarks } from "./browserLowEnd";

export async function runBrowserWorkloadBenchmarks(): Promise<void> {
    const browser = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info"] });
    try {
        const page = await browser.newPage();
        await preparePage(page);
        await runBrowserTemplateBenchmarks(page);
        await runBrowserDiscoveryBenchmarks(page);
        await runBrowserMutationBenchmarks(page);
        await page.close();
        const lowEndPage = await browser.newPage();
        await preparePage(lowEndPage);
        await runLowEndBrowserBenchmarks(lowEndPage);
    } finally {
        await browser.close();
    }
}
