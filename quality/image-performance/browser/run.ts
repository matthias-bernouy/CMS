import { chromium } from "playwright";
import { parseArguments } from "../core/args";
import { writeJsonArtifact } from "../core/output";
import { runBrowserCase } from "./assertions";
import { startBrowserFixtureServer } from "./server";

async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const server = await startBrowserFixtureServer();
    const browser = await chromium.launch({ headless: true });
    try {
        const cases = [];
        for (const dpr of [1, 2]) {
            cases.push(await runBrowserCase(browser, server, "auto", dpr));
            cases.push(await runBrowserCase(browser, server, "fallback", dpr));
        }
        const result = { schema: "cms.image-performance.browser.v1", passed: true, cases };
        const output = args.get("output")?.trim();
        if (output) {
            await writeJsonArtifact(output, result);
        }
        console.info(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
        server.stop();
    }
}

await main().catch((error: unknown) => {
    console.error(`[image-performance-browser] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
