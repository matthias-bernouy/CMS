import type { Browser, Page } from "playwright";
import type { BrowserFixtureServer } from "./server";

export type BrowserCase = {
    mode: "auto" | "fallback";
    dpr: number;
    cls: number;
    selectedWidths: { narrow: number; wide: number };
    requests: string[];
};

export async function runBrowserCase(
    browser: Browser,
    server: BrowserFixtureServer,
    mode: BrowserCase["mode"],
    dpr: number,
): Promise<BrowserCase> {
    server.reset();
    const context = await browser.newContext({
        viewport: { width: 1_000, height: 1_400 },
        deviceScaleFactor: dpr,
    });
    try {
        const page = await context.newPage();
        await page.goto(`${server.origin}/?mode=${mode}`);
        await page.waitForFunction(() => window.__imageFixtureReady === true);
        await waitForImages(page);
        const result = await page.evaluate(() => ({
            cls: window.__cls ?? 0,
            current: Object.fromEntries(
                [...document.querySelectorAll<HTMLImageElement>("img[data-slot]")].map((image) => [
                    image.dataset.slot!,
                    image.currentSrc,
                ]),
            ),
            order: window.__activationOrder ?? {},
        }));
        const selectedWidths = {
            narrow: selectedWidth(result.current.narrow),
            wide: selectedWidth(result.current.wide),
        };
        assertCase(mode, dpr, selectedWidths, result.order, result.cls, server.requests);
        return { mode, dpr, cls: result.cls, selectedWidths, requests: [...server.requests] };
    } finally {
        await context.close();
    }
}

async function waitForImages(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
}

function selectedWidth(url: string | undefined): number {
    if (!url) {
        throw new Error("Browser did not select an image URL");
    }
    const width = Number(new URL(url).searchParams.get("cms-width"));
    if (!Number.isSafeInteger(width) || width <= 0) {
        throw new Error(`Browser selected a non-canonical URL: ${url}`);
    }
    return width;
}

function assertCase(
    mode: BrowserCase["mode"],
    dpr: number,
    widths: BrowserCase["selectedWidths"],
    order: Record<string, string[]>,
    cls: number,
    requests: string[],
): void {
    const expected = mode === "auto"
        ? dpr === 1 ? { narrow: 384, wide: 1_024 } : { narrow: 768, wide: 1_600 }
        : dpr === 1 ? { narrow: 1_024, wide: 1_024 } : { narrow: 1_600, wide: 1_600 };
    if (widths.narrow !== expected.narrow || widths.wide !== expected.wide) {
        throw new Error(`Unexpected responsive selection: ${JSON.stringify({ mode, dpr, widths, expected })}`);
    }
    if (requests.length !== 2 || requests.some((url) => !url.includes("cms-width="))) {
        throw new Error(`Expected exactly two derivative requests, received ${JSON.stringify(requests)}`);
    }
    if (cls > 0.001) {
        throw new Error(`CLS ${cls} exceeded 0.001`);
    }
    for (const slot of ["narrow", "wide"]) {
        const unique = order[slot]?.filter((name, index, values) => values.indexOf(name) === index) ?? [];
        const positions = ["width", "height", "sizes", "srcset", "src"].map((name) => unique.indexOf(name));
        if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position < positions[index - 1]!)) {
            throw new Error(`Unsafe activation order for ${slot}: ${JSON.stringify(unique)}`);
        }
    }
}
