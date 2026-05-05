import type { Page } from "playwright";

export type BrowserScenario = {
    kind?: "browser";
    name: string;
    run: string;
    tolerances?: Record<string, number>;
    absolutes?: Record<string, number>;
};

export type DriverScenario = {
    kind: "driver";
    name: string;
    run: (page: Page) => Promise<Record<string, number>>;
    tolerances?: Record<string, number>;
    absolutes?: Record<string, number>;
};

export type Scenario = BrowserScenario | DriverScenario;

export function stats(samples: number[], fix = 3): { median: number; p95: number; max: number; min: number } {
    const s = [...samples].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
    return {
        min: +s[0]!.toFixed(fix),
        median: +q(0.5).toFixed(fix),
        p95: +q(0.95).toFixed(fix),
        max: +s[s.length - 1]!.toFixed(fix),
    };
}

export async function ensureFocusedParagraph(page: Page) {
    await page.evaluate(() => {
        const main = document.querySelector("main")!;
        let p = main.querySelector("p");
        if (!p) { p = document.createElement("p"); main.appendChild(p); }
        (p as HTMLElement).focus();
        const sel = getSelection()!;
        const r = document.createRange();
        r.selectNodeContents(p);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
    });
}
