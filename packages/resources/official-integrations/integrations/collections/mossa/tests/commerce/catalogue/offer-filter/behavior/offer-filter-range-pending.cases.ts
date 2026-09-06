import { expect, test } from "bun:test";
import { primarySchema } from "../support/offer-filter-panel.fixtures";
import { createBindingCore, defineFilter, filterTag, settleLifecycle } from "../support/offer-filter-panel.harness";

test("a local numeric edit wins over a pending URL reflection after another filter changes", async () => {
    await defineFilter();
    const originalFetch = globalThis.fetch;
    const originalUrl = location.href;
    globalThis.fetch = () => Promise.resolve(Response.json(primarySchema));
    history.replaceState(null, "", `${location.pathname}?category=catalog/primary`);
    const core = createBindingCore();
    const panel = document.createElement(filterTag);
    panel.setAttribute("schema-driven", "true");
    core.append(panel);
    try {
        document.body.append(core);
        await settleLifecycle();
        const range = panel.querySelector("[data-numeric-range]")!;
        const input = range.querySelector<HTMLInputElement>('[data-range-control="minimum"]')!;
        const proxy = range.querySelector<HTMLInputElement>('[data-range-proxy="minimum"]')!;
        document.dispatchEvent(new Event("cms-params:change"));
        expect(range.getAttribute("data-range-status")).toBe("pending");
        input.value = "2022";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await settleLifecycle();
        expect(input.value).toBe("2022");
        expect(proxy.value).toBe("2022");
        expect(range.querySelector("output")?.textContent).toContain("2022");
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await settleLifecycle();
        expect(new URLSearchParams(location.search).get("filter_numeric_attribute:gte")).toBe("2022");

        const slider = range.querySelector<HTMLInputElement>('[data-range-slider="maximum"]')!;
        document.dispatchEvent(new Event("cms-params:change"));
        slider.value = "2023";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        await settleLifecycle();
        expect(slider.value).toBe("2023");
        slider.dispatchEvent(new Event("change", { bubbles: true }));
        await settleLifecycle();
        expect(new URLSearchParams(location.search).get("filter_numeric_attribute:lte")).toBe("2023");
    } finally {
        core.remove();
        globalThis.fetch = originalFetch;
        history.replaceState(null, "", originalUrl);
    }
});
