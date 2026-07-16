import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardWDetail } from "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";
import type { WDetailData } from "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/types";
import { changeDetailInput, waitForDetail } from "../dashboards/detailTestHelpers";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard manual detail lifecycle", () => {
    test("renders manual data assigned before connection", () => {
        const detail = document.createElement("cms-dashboard-w-detail") as DashboardWDetail;
        detail.data = manualData("Manual product");

        document.body.append(detail);

        expect(detail.shadowRoot?.textContent).toContain("Manual product");
        expect(detail.shadowRoot?.querySelector("[data-field-control='productId']")).not.toBeNull();
    });

    test("lets the latest manual or bound input own the detail", async () => {
        let calls = 0;
        let firstResolve: ((response: Response) => void) | undefined;
        let firstSignal: AbortSignal | undefined;
        globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
            calls += 1;
            if (calls === 1) {
                firstSignal = init?.signal ?? undefined;
                return new Promise<Response>(resolve => { firstResolve = resolve; });
            }
            return Promise.resolve(Response.json({ items: [{ id: "b", title: "Bound option B" }] }));
        }) as unknown as typeof fetch;
        const detail = boundDetail({ id: "a", title: "Bound product A", name: "Original", productId: "a" });
        document.body.append(detail);
        await waitForDetail(() => firstSignal !== undefined);

        detail.data = manualData("Manual replacement");
        expect(firstSignal?.aborted).toBeTrue();
        expect(detail.shadowRoot?.textContent).toContain("Manual replacement");
        changeDetailInput(detail, "productId", "manual-edited");
        await new Promise(resolve => setTimeout(resolve, 270));
        expect(calls).toBe(1);

        firstResolve?.(Response.json({ items: [{ id: "a", title: "Stale bound option" }] }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(detail.shadowRoot?.textContent).not.toContain("Stale bound option");

        detail.setAttribute("data-source-json", JSON.stringify({
            id: "b", title: "Bound product B", name: "Fresh", productId: "b",
        }));
        await waitForDetail(() => detail.shadowRoot?.textContent?.includes("Bound product B") === true);
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("option[value='b']")));
        expect(calls).toBe(2);
        expect(detail.shadowRoot?.textContent).not.toContain("Manual replacement");
    });

    test("purges detached data and reloads bound state on reconnect", async () => {
        const signals: AbortSignal[] = [];
        let reconnectResolve: ((response: Response) => void) | undefined;
        let calls = 0;
        globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
            calls += 1;
            const signal = init?.signal;
            if (signal) signals.push(signal);
            if (calls === 1) return Promise.resolve(Response.json({
                items: [{ id: "a", title: "Private option" }],
            }));
            if (calls > 2) return new Promise<Response>(resolve => { reconnectResolve = resolve; });
            return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        }) as unknown as typeof fetch;
        const detail = boundDetail({ id: "a", title: "Private product", name: "Original", productId: "a" });
        document.body.append(detail);
        await waitForDetail(() => Boolean(detail.shadowRoot?.textContent?.includes("Private option")));
        changeDetailInput(detail, "name", "Private draft");
        fieldInput(detail, "name").dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        await waitForDetail(() => calls === 2);

        detail.remove();

        expect(signals[1]?.aborted).toBeTrue();
        expect(detail.shadowRoot?.textContent).not.toContain("Private product");
        expect(detail.shadowRoot?.querySelector("[data-field-control]")).toBeNull();

        document.body.append(detail);
        await waitForDetail(() => calls === 3);
        expect(detail.shadowRoot?.textContent).not.toContain("Private option");
        reconnectResolve?.(Response.json({ items: [{ id: "a", title: "Fresh option" }] }));
        await waitForDetail(() => detail.shadowRoot?.textContent?.includes("Fresh option") === true);
        expect(fieldInput(detail, "name").value).toBe("Original");
        expect(detail.shadowRoot?.textContent).toContain("Private product");
    });
});

function boundDetail(resource: Record<string, unknown>): DashboardWDetail {
    const detail = document.createElement("cms-dashboard-w-detail") as DashboardWDetail;
    detail.setAttribute("data-config-json", JSON.stringify({
        widget: "w-detail",
        id: "detail",
        source: { endpoint: "resource" },
        title: { path: "title" },
        main: [{ id: "main", title: "Main", fields: [
            { id: "name", label: "Name", path: "name", type: "text" },
            { id: "productId", label: "Product", path: "productId", type: "combobox", lookup: {
                endpoint: "products",
                params: { ownerId: "$resource.id", name: "$field.name" },
                itemsPath: "items",
                valuePath: "id",
                labelPath: "title",
            } },
        ] }],
    }));
    detail.setAttribute("data-source-id", "catalog");
    detail.setAttribute("data-row-key", String(resource.id ?? ""));
    detail.setAttribute("data-source-json", JSON.stringify(resource));
    return detail;
}
function manualData(title: string): WDetailData {
    return {
        rowKey: "manual",
        eyebrow: "Manual",
        title,
        actions: [],
        main: [{ title: "Main", fields: [
            { id: "productId", label: "Product", input: "text", value: "manual" },
        ] }],
        aside: [],
    };
}

function fieldInput(detail: DashboardWDetail, fieldId: string): HTMLInputElement {
    const control = detail.shadowRoot!.querySelector<HTMLElement & { shadowRoot: ShadowRoot }>(
        `[data-field-control='${fieldId}']`,
    )!;
    return control.shadowRoot.querySelector("input")!;
}
