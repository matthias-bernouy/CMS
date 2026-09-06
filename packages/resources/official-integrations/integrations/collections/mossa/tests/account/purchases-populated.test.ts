import { afterEach, beforeAll, expect, test } from "bun:test";
import { PurchaseList } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/account/orders/purchases/Bloc.ts";

const tag = "mossa-purchases-populated-test";
const originalFetch = globalThis.fetch;

beforeAll(() => {
    if (!customElements.get(tag)) {
        customElements.define(tag, class extends PurchaseList {});
    }
});

afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
    window.history.replaceState(null, "", "/");
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const order = { id: 42, status: "active", totalAmount: 4000, currency: "eur", createdAt: "2026-09-06T12:00:00Z" };

test("populated purchases apply copy changes without refetching and retain native pagination and order links", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return Response.json({
            items: [{ ...order, lineSummary: { firstTitle: "Demo racket", lineCount: 3 } }],
            total: 2,
        });
    }) as typeof fetch;
    const list = document.createElement(tag);
    for (const [name, value] of Object.entries({
        "page-size": "1",
        "order-url": "/order?id={orderId}",
        "order-action-label": "Open purchase",
        "placed-on-template": "Purchased {date}",
        "order-reference-template": "Purchase {id}",
        "other-items-template": "{title} with {count} more products",
        "total-label": "Amount paid",
        "label-active": "Preparing delivery",
        "pagination-previous-label": "Earlier",
        "pagination-next-label": "Later",
        "pagination-summary-template": "{start}–{end} / {total} ({page}/{pages})",
    })) {
        list.setAttribute(name, value);
    }
    document.body.append(list);
    await settle();
    const root = list.shadowRoot!;
    expect(root.querySelector(".order-number")?.textContent).toBe("Demo racket with 2 more products");
    expect(root.querySelector(".order-date")?.textContent).toBe("Purchase 42 · Purchased September 6, 2026");
    expect(root.querySelector(".status")?.textContent).toBe("Preparing delivery");
    expect(root.querySelector(".status")?.getAttribute("data-tone")).toBe("progress");
    expect(root.querySelector(".amount span")?.textContent).toBe("Amount paid");
    expect(root.querySelector(".amount strong")?.textContent).toBe("€40.00");
    expect(root.querySelector("[data-page-label]")?.textContent).toBe("1–1 / 2 (1/2)");
    const link = list.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/order?id=42");
    expect(link.textContent).toBe("Open purchase");
    expect(link.closest("mossa-button")?.getAttribute("tone")).toBe("neutral");
    for (const button of root.querySelectorAll("[data-pagination] mossa-button")) {
        expect(button.getAttribute("tone")).toBe("neutral");
    }
    list.setAttribute("label-active", "Shipment being prepared");
    expect(root.querySelector(".status")?.textContent).toBe("Shipment being prepared");
    list.removeAttribute("label-active");
    expect(root.querySelector(".status")?.textContent).toBe("Order in progress");
    expect(list.querySelectorAll("[data-generated-purchase-action]").length).toBe(1);
    expect(requests).toHaveLength(1);
    const previous = root.querySelector<HTMLButtonElement>("[data-previous]")!;
    const next = root.querySelector<HTMLButtonElement>("[data-next]")!;
    expect(previous.textContent).toBe("Earlier");
    expect(previous.disabled).toBe(true);
    expect(next.textContent).toBe("Later");
    next.click();
    await settle();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("offset=1");
    expect(root.querySelector("[data-page-label]")?.textContent).toBe("2–2 / 2 (2/2)");
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(true);
});

test("operation status copy preserves precedence over order status and has English defaults", async () => {
    const operations = [
        [{ settlementStatus: "blocked", claimStatus: "open" }, "review-required", "danger"],
        [{ claimStatus: "open", paymentStatus: "refunded" }, "dispute-in-progress", "progress"],
        [{ settlementStatus: "refund_pending" }, "refund-in-progress", "progress"],
        [{ paymentStatus: "refunded" }, "refunded", "neutral"],
        [{ paymentStatus: "partially_refunded" }, "partially-refunded", "neutral"],
        [{ paymentStatus: "failed" }, "payment-failed", "danger"],
        [{ paymentStatus: "cancelled" }, "payment-cancelled", "danger"],
        [{ paymentStatus: "processing" }, "payment-pending", "progress"],
    ] as const;
    globalThis.fetch = (async () =>
        Response.json({
            items: operations.map(([operation], index) => ({
                ...order,
                id: index + 1,
                createdAt: "invalid",
                operation,
            })),
            total: operations.length,
        })) as typeof fetch;
    const list = document.createElement(tag);
    list.setAttribute("unknown-date-label", "Date unavailable");
    for (const [, status] of operations) {
        list.setAttribute(`label-${status}`, `Custom ${status}`);
    }
    document.body.append(list);
    await settle();
    const rows = [...list.shadowRoot!.querySelectorAll(".purchase-row")];
    for (const [index, [, status, tone]] of operations.entries()) {
        expect(rows[index]?.querySelector(".status")?.textContent).toBe(`Custom ${status}`);
        expect(rows[index]?.querySelector(".status")?.getAttribute("data-tone")).toBe(tone);
        expect(rows[index]?.querySelector(".order-date")?.textContent).toBe("Placed on Date unavailable");
    }
    list.removeAttribute("label-partially-refunded");
    expect(list.shadowRoot!.querySelectorAll(".status")[4]?.textContent).toBe("Partially refunded");
});
