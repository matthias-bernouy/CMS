import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import {
    formatMoney as formatListMoney,
    saleDetailUrl,
} from "../../../integrations/commerce/versions/1.0.0/blocs/commerce-account-sales/helpers";
import {
    conditionLabel,
    platformShippingShareAmount,
    salePresentationStatus,
    saleStatusDefaults,
    sellerCommissionAmount,
    sellerMerchandiseAmount,
    sellerProceedsAmount,
    sellerShippingShareAmount,
    shippingAmount,
    variantLabel,
} from "../../../integrations/commerce/versions/1.0.0/blocs/commerce-sale-detail/helpers";
import { renderSale } from "../../../integrations/commerce/versions/1.0.0/blocs/commerce-sale-detail/render";

const blocsRoot = resolve(import.meta.dir, "../../../integrations/commerce/versions/1.0.0/blocs");

describe("Commerce seller blocs", () => {
    test("formats immutable sale summaries and detail links", () => {
        expect(formatListMoney(11450, "eur", "fr-FR")).toBe("114,50 €");
        expect(saleDetailUrl("/account/sale", { id: 42 }, "orderId")).toBe("/account/sale?orderId=42");
        expect(saleDetailUrl("/sales/{publicId}", { publicId: "order / 42" })).toBe("/sales/order%20%2F%2042");
        expect(shippingAmount({ shippingAmount: 450 })).toBe(450);
        expect(shippingAmount({ shippingAmount: 999, financialTerms: { shippingAmount: 450 } })).toBe(450);
        expect(Number.isNaN(shippingAmount({ subtotalAmount: 11000, totalAmount: 12070 }))).toBe(true);
        expect(sellerProceedsAmount({
            totalAmount: 12_070,
            financialTerms: { sellerProceedsAmount: 10_450 },
        })).toBe(10_450);
        expect(sellerMerchandiseAmount({
            subtotalAmount: 12_000,
            financialTerms: { merchandiseSubtotalAmount: 11_000 },
        })).toBe(11_000);
        expect(sellerCommissionAmount({ financialTerms: { sellerCommissionAmount: 220 } })).toBe(220);
        expect(platformShippingShareAmount({ financialTerms: { platformShippingShareAmount: 450 } })).toBe(450);
        expect(sellerShippingShareAmount({ financialTerms: { sellerShippingShareAmount: 0 } })).toBe(0);
        expect(Number.isNaN(sellerProceedsAmount({ totalAmount: 12_070 }))).toBe(true);
        expect(Number.isNaN(sellerCommissionAmount({ financialTerms: {} }))).toBe(true);
        expect(Number.isNaN(sellerProceedsAmount({ financialTerms: { sellerProceedsAmount: null } }))).toBe(true);
        expect(conditionLabel("very_good")).toBe("Très bon état");
        expect(variantLabel({ options: [{ axisLabel: "Grip", valueLabel: "L1" }] })).toBe("Grip : L1");
        expect(saleStatusDefaults.active).toBe("À expédier");
        expect(salePresentationStatus({
            status: "active",
            fulfillment: { status: "seller_handoff_declared" },
        })).toBe("seller_handoff_declared");
        expect(saleStatusDefaults[salePresentationStatus({
            status: "active",
            fulfillment: { status: "seller_handoff_declared" },
        })]).toBe("Dépôt déclaré");
        expect(salePresentationStatus({
            status: "active",
            fulfillment: { status: "carrier_accepted" },
        })).toBe("carrier_accepted");
        expect(salePresentationStatus({
            status: "cancelled",
            fulfillment: { status: "seller_handoff_declared" },
        })).toBe("cancelled");
    });

    test("compiles an authenticated sales list from the expected Commerce endpoint", async () => {
        const compiled = await compile("commerce-account-sales");
        expect(compiled.viewJS).toContain('|| "mySales"');
        expect(compiled.viewJS).toContain("basic-pagination:change");
        expect(compiled.viewJS).toContain("history.replaceState");
        expect(compiled.viewJS).toContain("<basic-card");
        expect(compiled.viewJS).toContain("<basic-select");
        expect(compiled.editorJS).toContain('attribute: "sales-endpoint"');
        expect(compiled.editorJS).toContain('attribute: "detail-url"');
    });

    test("renders the server-snapshotted seller proceeds instead of the buyer total", () => {
        const values = new Map<string, string>();
        const status = { dataset: {} as Record<string, string>, textContent: "" };
        const lines = { replaceChildren: (..._children: unknown[]) => undefined };
        const host = {
            locale: "fr-FR",
            root: { querySelector: (selector: string) => selector === "[data-order-status]" ? status : lines },
            setText: (selector: string, value: string) => values.set(selector, value),
            statusLabel: () => "À traiter",
            text: (_attribute: string, fallback: string) => fallback,
        };

        renderSale(host, {
            id: 42,
            status: "placed",
            currency: "eur",
            subtotalAmount: 11_000,
            shippingAmount: 450,
            totalAmount: 12_070,
            financialTerms: {
                merchandiseSubtotalAmount: 11_000,
                shippingAmount: 450,
                sellerCommissionAmount: 550,
                platformShippingShareAmount: 450,
                sellerShippingShareAmount: 0,
                sellerProceedsAmount: 10_450,
                currency: "eur",
            },
            lines: [],
            createdAt: "2026-07-13T12:00:00.000Z",
        });

        expect(values.get("[data-subtotal]")).toBe(formatListMoney(11_000, "eur", "fr-FR"));
        expect(values.get("[data-commission]")).toBe(formatListMoney(-550, "eur", "fr-FR"));
        expect(values.get("[data-shipping]")).toBe("Prise en charge par Courtside");
        expect(values.get("[data-total]")).toBe(formatListMoney(10_450, "eur", "fr-FR"));
        expect(values.get("[data-total]")).not.toBe(formatListMoney(12_070, "eur", "fr-FR"));

        renderSale(host, {
            id: 43,
            status: "placed",
            currency: "eur",
            subtotalAmount: 11_000,
            shippingAmount: 450,
            totalAmount: 11_450,
            financialTerms: {
                merchandiseSubtotalAmount: 11_000,
                shippingAmount: 450,
                sellerCommissionAmount: 0,
                platformShippingShareAmount: 0,
                sellerShippingShareAmount: 450,
                sellerProceedsAmount: 11_450,
                currency: "eur",
            },
            lines: [],
            createdAt: "2026-07-13T12:00:00.000Z",
        });

        expect(values.get("[data-commission]")).toBe(formatListMoney(0, "eur", "fr-FR"));
        expect(values.get("[data-shipping]")).toBe("+4,50 €");
        expect(values.get("[data-total]")).toBe(formatListMoney(11_450, "eur", "fr-FR"));
    });

    test("keeps sale detail Commerce-only and exposes a fulfillment slot", async () => {
        const compiled = await compile("commerce-sale-detail");
        expect(compiled.viewJS).toContain('|| "mySale"');
        expect(compiled.viewJS).toContain('slot name="fulfillment"');
        expect(compiled.viewJS).toContain("offerSnapshot");
        expect(compiled.viewJS).toContain("sellerCommissionAmount(order)");
        expect(compiled.viewJS).toContain("sellerShippingShareAmount(order)");
        expect(compiled.viewJS).toContain("sellerProceedsAmount(order)");
        expect(compiled.viewJS).toContain("salePresentationStatus(order)");
        expect(compiled.viewJS).toContain("commerce-fulfillment:updated");
        expect(compiled.viewJS).not.toContain('formatMoney(order.totalAmount, order.currency');
        expect(compiled.viewJS).toContain("Montant net à recevoir");
        expect(compiled.viewJS).toContain("Commission Courtside");
        expect(compiled.viewJS).toContain("Prise en charge par Courtside");
        expect(compiled.viewJS).not.toContain("data-back action=\"link\"");
        expect(compiled.viewJS).not.toContain("getShipmentForMySale");
        expect(compiled.viewJS).not.toContain("createShipmentForMySale");
        expect(compiled.editorJS).toContain('slot: "fulfillment"');
        expect(compiled.editorJS).toContain('attribute: "sale-endpoint"');
    });
});

async function compile(tag: string) {
    const directory = resolve(blocsRoot, tag);
    const files = await readdir(directory);
    const view = await readFile(resolve(directory, "Bloc.ts"), "utf8");
    const editor = await readFile(resolve(directory, "BlocEditor.ts"), "utf8");
    const source: Record<string, string> = {};
    for (const file of files.filter(name => !["Bloc.ts", "BlocEditor.ts"].includes(name))) {
        source[file] = Buffer.from(await readFile(resolve(directory, file))).toString("base64");
    }
    return prepare_bloc(
        new File([view], "Bloc.ts", { type: "text/typescript" }),
        new File([editor], "BlocEditor.ts", { type: "text/typescript" }),
        tag,
        "Commerce",
        "",
        tag,
        source,
    );
}
