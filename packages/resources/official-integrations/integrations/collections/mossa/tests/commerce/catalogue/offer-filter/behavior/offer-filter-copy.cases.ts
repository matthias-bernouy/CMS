import { expect, test } from "bun:test";
import { primarySchema } from "../support/offer-filter-panel.fixtures";
import { defineFilter, filterTag, settleLifecycle } from "../support/offer-filter-panel.harness";

test("schema filters keep authored copy through loading, category switches, clearing, and errors", async () => {
    await defineFilter();
    const originalFetch = globalThis.fetch;
    const originalUrl = location.href;
    const originalError = console.error;
    const requests: Array<{ url: URL; resolve(response: Response): void }> = [];
    globalThis.fetch = (input) =>
        new Promise<Response>((resolve) => requests.push({ url: new URL(String(input)), resolve }));
    console.error = () => {};
    const panel = document.createElement(filterTag);
    panel.setAttribute("schema-driven", "true");
    const copy = {
        "all-label": "Any",
        "boolean-true-label": "Enabled",
        "boolean-false-label": "Disabled",
        "select-category-label": "Select a collection.",
        "loading-label": "Fetching choices…",
        "error-label": "Choices unavailable.",
    };
    Object.entries(copy).forEach(([attribute, value]) => panel.setAttribute(attribute, value));
    const booleanSchema = {
        ...primarySchema,
        fields: [{ ...primarySchema.fields[2], key: "enabled", label: "Enabled", type: "boolean", options: [] }],
    };
    const category = async (value: string) => {
        history.replaceState(null, "", `${location.pathname}${value ? `?category=${value}` : ""}`);
        document.dispatchEvent(new Event("cms-params:change"));
        await settleLifecycle();
    };
    try {
        await category("");
        document.body.append(panel);
        await settleLifecycle();
        expect(panel.textContent).toContain(copy["select-category-label"]);
        expect(requests).toHaveLength(0);
        await category("catalog/primary");
        expect(panel.getAttribute("data-schema-status")).toBe("loading");
        expect(panel.textContent).toContain(copy["loading-label"]);
        requests[0]!.resolve(Response.json(primarySchema));
        await settleLifecycle();
        expect(panel.getAttribute("data-schema-status")).toBe("ready");
        expect(panel.querySelector('[name="filter_choice_attribute"] mossa-option')?.textContent).toBe(
            "Any · Choice attribute",
        );

        await category("catalog/boolean");
        expect(panel.querySelector('[name="filter_choice_attribute"]')).toBeNull();
        requests[1]!.resolve(Response.json(booleanSchema));
        await settleLifecycle();
        const options = () =>
            [...panel.querySelectorAll('[name="filter_enabled"] mossa-option')].map((item) => ({
                value: item.getAttribute("value"),
                label: item.textContent,
            }));
        expect(options()).toEqual([
            { value: "", label: "Any · Enabled" },
            { value: "true", label: "Enabled" },
            { value: "false", label: "Disabled" },
        ]);
        panel.removeAttribute("all-label");
        panel.removeAttribute("boolean-true-label");
        panel.removeAttribute("boolean-false-label");
        await settleLifecycle();
        expect(options()).toEqual([
            { value: "", label: "All · Enabled" },
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
        ]);
        expect(requests).toHaveLength(2);

        await category("");
        expect(panel.getAttribute("data-schema-status")).toBe("idle");
        expect(panel.textContent).toContain(copy["select-category-label"]);
        expect(panel.querySelector('[name="filter_enabled"]')).toBeNull();
        await category("catalog/unavailable");
        requests[2]!.resolve(Response.json({}, { status: 503 }));
        await settleLifecycle();
        expect(panel.querySelector('[role="alert"]')?.textContent).toBe(copy["error-label"]);
    } finally {
        panel.remove();
        history.replaceState(null, "", originalUrl);
        globalThis.fetch = originalFetch;
        console.error = originalError;
    }
});
