import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium, type Locator } from "playwright";
import { variantsResource, variantsWidgetFixture } from "./variants.fixture";

const bundlePath = resolve(import.meta.dir, "../../src/static/assets/control-components.js");

test("Variants keeps free-form values aligned and lets the metadata popup escape table overflow", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const variantsWidget = await variantsWidgetFixture();
        const page = await browser.newPage({ viewport: { width: 874, height: 700 } });
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.setContent(`
                <style>
                    body { margin: 12px; background: #f5f7f6; font-family: Arial, sans-serif; }
                    cms-dashboard-w-detail { display: block; width: 540px; }
                </style>
            `);
        await page.addScriptTag({ path: bundlePath });
        await page.evaluate(
            ({ resource, widget }) => {
                const detail = document.createElement("cms-dashboard-w-detail");
                detail.dataset.configJson = JSON.stringify(widget);
                detail.dataset.sourceJson = JSON.stringify(resource);
                document.body.append(detail);
            },
            { resource: variantsResource, widget: variantsWidget },
        );

        const table = page.locator('.detail-table[data-field-control="variantAxes"]');
        const metadataControl = page.locator("p9r-combobox .control");
        const metadataInput = page.locator("p9r-combobox input");
        const valuesControl = page.locator("p9r-token-input .token-control");
        const valuesInput = page.locator("p9r-token-input input");
        const removeButton = page.locator("[data-table-remove]");
        await valuesInput.waitFor();
        await page.locator("p9r-combobox").evaluate((host) => {
            for (const [value, label] of [
                ["model-year", "Model year"],
                ["grip-size", "Grip size"],
            ] as const) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                host.append(option);
            }
        });

        const tableBox = await visibleBox(table);
        const metadataBox = await visibleBox(metadataControl);
        const valuesBox = await visibleBox(valuesControl);
        const removeBox = await visibleBox(removeButton);
        expect(Math.abs(metadataBox.y - valuesBox.y)).toBeLessThanOrEqual(1);
        expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(tableBox.x + tableBox.width + 1);
        expect(await tableMetrics(table)).toMatchObject({ horizontalOverflow: 0 });

        const beforePopup = await tableMetrics(table);
        await metadataInput.focus();
        const listbox = page.locator('p9r-combobox [role="listbox"]');
        await listbox.waitFor({ state: "visible" });
        const listboxBox = await visibleBox(listbox);
        expect(await listbox.evaluate((element) => element.matches(":popover-open"))).toBe(true);
        expect(await listbox.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
        expect(listboxBox.y + listboxBox.height).toBeGreaterThan(tableBox.y + tableBox.height);
        expect((await tableMetrics(table)).scrollHeight).toBe(beforePopup.scrollHeight);

        await metadataInput.press("Escape");
        await valuesInput.fill("L2");
        await valuesInput.press("Enter");
        expect(await page.locator("p9r-token-input .listbox").isHidden()).toBe(true);
        expect(await page.locator("p9r-token-input .token > span").textContent()).toBe("L2");
        const matrixRows = page.locator('.detail-table[data-field-control="variantMatrix"] [data-table-row]');
        expect(await matrixRows.count()).toBe(1);
        expect(await matrixRows.first().textContent()).toContain("L2");
        expect(pageErrors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);

async function visibleBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    return box!;
}

async function tableMetrics(locator: Locator): Promise<{
    horizontalOverflow: number;
    scrollHeight: number;
}> {
    return locator.evaluate((element) => ({
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        scrollHeight: element.scrollHeight,
    }));
}
