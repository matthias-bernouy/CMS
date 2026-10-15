import type { Page } from "playwright";
import { assertGrowth, assertMaximum, printResults } from "../benchmark";
import { browserBenchmark, type BrowserWindow } from "./browserBinding";

export async function runBrowserMutationBenchmarks(page: Page): Promise<void> {
    const controls10 = await browserBenchmark(page, "submit mutation with 10 controls", () => submitForm(page, 10));
    const controls100 = await browserBenchmark(page, "submit mutation with 100 controls", () => submitForm(page, 100));
    const controls1000 = await browserBenchmark(page, "submit mutation with 1,000 controls", () =>
        submitForm(page, 1_000),
    );
    const files = await browserBenchmark(page, "reject 4 unsupported 1 MiB files", () => rejectFiles(page));
    printResults("Chromium declarative mutations", [controls10, controls100, controls1000, files]);
    assertMaximum("1,000-control mutation p95", controls1000.p95Ms, 3_000);
    assertMaximum("four-file rejection p95", files.p95Ms, 3_000);
    assertGrowth("10 to 1,000 control mutation growth", controls10, controls1000, 150);
}

async function rejectFiles(page: Page): Promise<number> {
    return page.evaluate(async () => {
        document.querySelector("cms-binding-core")?.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const win = window as unknown as BrowserWindow;
        win.__perfResponse = { uploaded: true };
        const root = document.createElement("cms-binding-core");
        root.innerHTML = `<form cms-mutation="performance:upload as mutation" cms-mutation-reset="false">
            <input name="files" type="file" multiple>
            <output>{{ mutation.outcome.kind }}</output>
        </form>`;
        document.body.appendChild(root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const transfer = new DataTransfer();
        for (let index = 0; index < 4; index += 1) {
            transfer.items.add(new File([new Uint8Array(1024 * 1024)], `asset-${index}.bin`));
        }
        root.querySelector<HTMLInputElement>('input[type="file"]')!.files = transfer.files;
        const expectedFetches = win.__perfFetches;
        const startedAt = performance.now();
        root.querySelector("form")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
        await win.__perfWaitUntil(
            () => win.__perfFetches === expectedFetches && root.querySelector("output")?.textContent === "failure",
        );
        return performance.now() - startedAt;
    });
}

async function submitForm(page: Page, controlCount: number): Promise<number> {
    return page.evaluate(async (count) => {
        document.querySelector("cms-binding-core")?.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const win = window as unknown as BrowserWindow;
        win.__perfResponse = { saved: true };
        const root = document.createElement("cms-binding-core");
        const controls = Array.from(
            { length: count },
            (_, index) => `<input name="field${index}" value="value${index}">`,
        ).join("");
        root.innerHTML = `<form cms-mutation="performance:save as mutation" cms-mutation-reset="false">
            ${controls}<output data-request-id="{{ mutation.outcome.requestId }}">{{ mutation.data.saved }}</output>
        </form>`;
        document.body.appendChild(root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const expectedFetches = win.__perfFetches + 1;
        const startedAt = performance.now();
        root.querySelector("form")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
        await win.__perfWaitUntil(
            () =>
                win.__perfFetches >= expectedFetches &&
                root.querySelector("output")?.textContent === "true" &&
                Boolean(root.querySelector("output")?.getAttribute("data-request-id")),
        );
        return performance.now() - startedAt;
    }, controlCount);
}
