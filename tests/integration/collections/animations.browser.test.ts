import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { compileBlocStyle } from "@bernouy/repository/collections/build";

const browserTest = process.env.ULVIA_RUN_COLLECTION_STYLE_BROWSER === "1" ? test : test.skip;

const ids = ["publisher--atlas--panel", "publisher--atlas--other", "publisher--other--panel", "other--atlas--panel"];

browserTest.each([false, true])(
    "same local animation names remain isolated in the browser (reverse load order: %s)",
    async (reverse) => {
        const styles = ids.map((id, index) =>
            compileBlocStyle(
                id,
                `
        @keyframes fade { from { opacity: 0; } to { opacity: ${(index + 1) / 4}; } }
        :scope, :scope .target { animation: fade 100s linear -50s paused; }
    `,
            ),
        );
        const browser = await chromium.launch({ headless: true });
        try {
            const page = await browser.newPage();
            await page.setContent(`<style>${(reverse ? styles.toReversed() : styles).join("\n")}</style>
            <div cms-bloc="${ids[0]}"><span class="target" id="local">Local</span>
                <div cms-bloc="${ids[3]}" id="nested"><span class="target" id="nested-child">Nested</span></div>
            </div>
            ${ids
                .slice(1, 3)
                .map((id) => `<div cms-bloc="${id}"></div>`)
                .join("")}
            <div class="target" id="outside">Outside</div>`);
            const values = await page.locator("[cms-bloc]").evaluateAll((nodes) =>
                nodes.map((node) => ({
                    id: node.getAttribute("cms-bloc"),
                    name: getComputedStyle(node).animationName,
                    opacity: Number(getComputedStyle(node).opacity),
                    count: node.getAnimations().length,
                })),
            );
            expect(new Set(values.map((value) => value.name)).size).toBe(ids.length);
            for (const [index, id] of ids.entries()) {
                const value = values.find((item) => item.id === id)!;
                expect(value.opacity).toBeCloseTo((index + 1) / 8, 6);
                expect(value.count).toBe(1);
            }
            for (const [selector, opacity] of [
                ["#local", 0.125],
                ["#nested-child", 0.5],
                ["#outside", 1],
            ] as const) {
                expect(
                    await page.locator(selector).evaluate((node) => Number(getComputedStyle(node).opacity)),
                ).toBeCloseTo(opacity, 6);
            }
            expect(await page.locator("#outside").evaluate((node) => getComputedStyle(node).animationName)).toBe(
                "none",
            );
            const victim = values.find((value) => value.id === ids[0])!;
            const attemptedOverride = compileBlocStyle(
                "attacker--atlas--panel",
                `
                @keyframes ${victim.name} { from { opacity: 0; } to { opacity: 0; } }
            `,
            );
            await page.addStyleTag({ content: attemptedOverride });
            expect(
                await page.locator(`[cms-bloc="${ids[0]}"]`).evaluate((node) => Number(getComputedStyle(node).opacity)),
            ).toBeCloseTo(0.125, 6);
        } finally {
            await browser.close();
        }
    },
);

browserTest("conditional keyframes overrides and quoted shorthand names retain browser semantics", async () => {
    const style = compileBlocStyle(
        ids[0]!,
        `
        @keyframes "fade" { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
            @supports (display: grid) { @keyframes fade { from { opacity: .5; } to { opacity: 1; } } }
        }
        :scope { animation:100s"fade" linear -50s paused; }
    `,
    );
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.setContent(`<style>${style}</style><div cms-bloc="${ids[0]}"></div>`);
        expect(await page.locator("[cms-bloc]").evaluate((node) => Number(getComputedStyle(node).opacity))).toBeCloseTo(
            0.75,
            6,
        );
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.waitForFunction(() => getComputedStyle(document.querySelector("[cms-bloc]")!).opacity === "0.5");
        expect(await page.locator("[cms-bloc]").evaluate((node) => Number(getComputedStyle(node).opacity))).toBeCloseTo(
            0.5,
            6,
        );
    } finally {
        await browser.close();
    }
});

browserTest("historical non-animated EOF block recovery retains its rendered result", async () => {
    const css = compileBlocStyle(ids[0]!, ":scope { opacity: .5;");
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>${css}</style><div cms-bloc="${ids[0]}"></div><div id="outside"></div>`);
        expect(await page.locator("[cms-bloc]").evaluate((node) => getComputedStyle(node).opacity)).toBe("0.5");
        expect(await page.locator("#outside").evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    } finally {
        await browser.close();
    }
});
