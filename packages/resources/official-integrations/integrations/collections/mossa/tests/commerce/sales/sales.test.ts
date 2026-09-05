import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { declaredBlocViewSources } from "../../../../../../tests/helpers/blocArtifactSource";
import {
    conditionLabel,
    formatMoney as formatListMoney,
    platformShippingShareAmount,
    salePresentationStatus,
    saleStatusDefaults,
    sellerCommissionAmount,
    sellerMerchandiseAmount,
    sellerProceedsAmount,
    sellerShippingShareAmount,
    shippingAmount,
    variantLabel,
} from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/details/commerce-sale-detail/helpers.ts";
import { renderSale } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/details/commerce-sale-detail/render.ts";

const blocsRoot = resolve(OFFICIAL_INTEGRATIONS_ROOT, "collections/mossa/blocs/domains/commerce/offers/details");

describe("Commerce seller blocs", () => {
    test("formats immutable sale details", () => {
        expect(formatListMoney(11450, "eur", "fr-FR")).toBe("114,50 €");
        expect(shippingAmount({ shippingAmount: 450 })).toBe(450);
        expect(shippingAmount({ shippingAmount: 999, financialTerms: { shippingAmount: 450 } })).toBe(450);
        expect(Number.isNaN(shippingAmount({ subtotalAmount: 11000, totalAmount: 12070 }))).toBe(true);
        expect(
            sellerProceedsAmount({
                totalAmount: 12_070,
                financialTerms: { sellerProceedsAmount: 10_450 },
            }),
        ).toBe(10_450);
        expect(
            sellerMerchandiseAmount({
                subtotalAmount: 12_000,
                financialTerms: { merchandiseSubtotalAmount: 11_000 },
            }),
        ).toBe(11_000);
        expect(sellerCommissionAmount({ financialTerms: { sellerCommissionAmount: 220 } })).toBe(220);
        expect(platformShippingShareAmount({ financialTerms: { platformShippingShareAmount: 450 } })).toBe(450);
        expect(sellerShippingShareAmount({ financialTerms: { sellerShippingShareAmount: 0 } })).toBe(0);
        expect(Number.isNaN(sellerProceedsAmount({ totalAmount: 12_070 }))).toBe(true);
        expect(Number.isNaN(sellerCommissionAmount({ financialTerms: {} }))).toBe(true);
        expect(Number.isNaN(sellerProceedsAmount({ financialTerms: { sellerProceedsAmount: null } }))).toBe(true);
        expect(conditionLabel("very_good")).toBe("Very good");
        expect(variantLabel({ options: [{ axisLabel: "Grip", valueLabel: "L1" }] })).toBe("Grip : L1");
        expect(saleStatusDefaults.active).toBe("To ship");
        expect(
            salePresentationStatus({
                status: "active",
                fulfillment: { status: "seller_handoff_declared" },
            }),
        ).toBe("seller_handoff_declared");
        expect(
            saleStatusDefaults[
                salePresentationStatus({
                    status: "active",
                    fulfillment: { status: "seller_handoff_declared" },
                })
            ],
        ).toBe("Handoff declared");
        expect(
            salePresentationStatus({
                status: "active",
                fulfillment: { status: "carrier_accepted" },
            }),
        ).toBe("carrier_accepted");
        expect(
            salePresentationStatus({
                status: "cancelled",
                fulfillment: { status: "seller_handoff_declared" },
            }),
        ).toBe("cancelled");
    });

    test("compiles an authenticated sales list as a Light DOM composition", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        const composition = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-account-sales",
        );
        const controller = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-account-sales-controller",
        );
        if (
            !composition ||
            composition.type !== "bloc" ||
            composition.bloc.compositionHTML === undefined ||
            !composition.bloc.editorJS ||
            !controller ||
            controller.type !== "bloc" ||
            !controller.bloc.viewJS
        ) {
            throw new Error("commerce-account-sales composition sources not found");
        }

        const compiledController = await prepare_bloc(
            new File([controller.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            controller.bloc.name,
            controller.bloc.group ?? "Commerce",
            controller.bloc.description ?? "",
            controller.bloc.tag,
            controller.bloc.source,
            undefined,
            { viewPath: "controller/Bloc.ts" },
        );
        const runtimeSource = `${composition.bloc.compositionHTML}\n${compiledController.viewJS}`;
        const viewSource = declaredBlocViewSources(controller.bloc);
        const template = document.createElement("template");
        template.innerHTML = composition.bloc.compositionHTML;

        expect(runtimeSource).toContain("/.cms/sources/commerce/mySales?status=#{commerceSalesStatus}");
        expect(runtimeSource).toContain("mossa-pagination:change");
        expect(runtimeSource).toContain('cms-param-sync="commerceSalesOffset"');
        expect(runtimeSource).toContain("minorCurrency(sale.currency)");
        expect(runtimeSource).toContain("sale.createdAt | dateLong");
        expect(runtimeSource).toContain('cms-repeat="items as sale"');
        expect(runtimeSource).toContain('cms-condition="$source.loaded"');
        expect(runtimeSource).not.toContain("fetch(");
        expect(viewSource).not.toContain("Intl.");
        expect(viewSource).not.toContain("text-color");
        expect(viewSource).toContain('this.getAttribute("sale-url")');
        expect(viewSource).toContain('link.setAttribute("href"');
        expect(runtimeSource).not.toContain('createElement("mossa-button")');
        expect(runtimeSource).not.toContain('setAttribute("action", "link")');
        expect(template.content.querySelector("mossa-button > a[data-sale-link]")?.hasAttribute("href")).toBe(false);
        expect(composition.bloc.editorJS).not.toContain("ColorSetting");
        expect(composition.bloc.editorJS).toContain('attribute: "sale-url"');
    });

    test("bridges pagination to the declarative offset control without rendering content", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        const composition = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-account-sales",
        );
        const controller = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-account-sales-controller",
        );
        if (
            !composition ||
            composition.type !== "bloc" ||
            composition.bloc.compositionHTML === undefined ||
            !controller ||
            controller.type !== "bloc" ||
            !controller.bloc.viewJS
        ) {
            throw new Error("commerce-account-sales composition sources not found");
        }

        const tag = "test-commerce-account-sales-controller";
        const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
        (window as typeof window & { p9r?: unknown }).p9r = { Component };
        if (!customElements.get(tag)) {
            const compiled = await prepare_bloc(
                new File([controller.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
                null,
                controller.bloc.name,
                controller.bloc.group ?? "Commerce",
                controller.bloc.description ?? "",
                tag,
                controller.bloc.source,
                undefined,
                { viewPath: "controller/Bloc.ts" },
            );
            new Function(compiled.viewJS)();
        }

        const authored = document.createElement("template");
        authored.innerHTML = composition.bloc.compositionHTML;
        const sales = document.createElement(tag);
        sales.innerHTML = authored.content.querySelector("mossa-commerce-account-sales-controller")?.innerHTML ?? "";

        try {
            const offset = sales.querySelector<HTMLInputElement>("[data-pagination-offset]")!;
            offset.value = "10";
            document.body.append(sales);
            await settleLifecycle();
            const pagination = sales.querySelector("[data-pagination]");
            expect(pagination?.getAttribute("page")).toBe("2");
            pagination?.dispatchEvent(
                new CustomEvent("mossa-pagination:change", { bubbles: true, detail: { offset: 20 } }),
            );
            await settleLifecycle();
            expect(offset.value).toBe("20");
            expect(pagination?.getAttribute("page")).toBe("3");

            const filter = sales.querySelector("[data-pagination-reset]")!;
            filter.dispatchEvent(new Event("change", { bubbles: true }));
            await settleLifecycle();
            expect(offset.value).toBe("");
            expect(pagination?.getAttribute("page")).toBe("1");
        } finally {
            sales.remove();
            (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
        }
    });

    test("renders the server-snapshotted seller proceeds instead of the buyer total", () => {
        const values = new Map<string, string>();
        const status = { dataset: {} as Record<string, string>, textContent: "" };
        const lines = { replaceChildren: (..._children: unknown[]) => undefined };
        const host = {
            locale: "fr-FR",
            root: { querySelector: (selector: string) => (selector === "[data-order-status]" ? status : lines) },
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
        expect(values.get("[data-shipping]")).toBe("Covered by the platform");
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
        expect(compiled.viewSource).toContain("/.cms/sources/commerce/mySale?id=");
        expect(compiled.viewJS).toContain('slot name="fulfillment"');
        expect(compiled.viewJS).toContain("offerSnapshot");
        expect(compiled.viewSource).toContain("sellerCommissionAmount(order)");
        expect(compiled.viewSource).toContain("sellerShippingShareAmount(order)");
        expect(compiled.viewSource).toContain("sellerProceedsAmount(order)");
        expect(compiled.viewSource).toContain("salePresentationStatus(order)");
        expect(compiled.viewJS).toContain("commerce-fulfillment:updated");
        expect(compiled.viewSource).not.toContain("formatMoney(order.totalAmount, order.currency");
        expect(compiled.viewJS).toContain("Net amount to receive");
        expect(compiled.viewJS).toContain("Platform commission");
        expect(compiled.viewJS).toContain("Covered by the platform");
        expect(compiled.viewJS).not.toContain('data-back action="link"');
        expect(compiled.viewSource).not.toContain("getShipmentForMySale");
        expect(compiled.viewSource).not.toContain("createShipmentForMySale");
        expect(compiled.editorSource).toContain('slot: "fulfillment"');
        expect(compiled.editorSource).not.toContain('attribute: "sale-endpoint"');
    });
});

async function compile(tag: string, runtimeTag = tag) {
    const directory = resolve(blocsRoot, tag);
    const files = await readdir(directory);
    const view = await readFile(resolve(directory, "Bloc.ts"), "utf8");
    const editor = await readFile(resolve(directory, "BlocEditor.ts"), "utf8");
    const source: Record<string, string> = {};
    for (const file of files.filter((name) => !["Bloc.ts", "BlocEditor.ts"].includes(name))) {
        const content = await readFile(resolve(directory, file));
        source[file] = Buffer.from(content).toString("base64");
    }
    const compiled = await prepare_bloc(
        new File([view], "Bloc.ts", { type: "text/typescript" }),
        new File([editor], "BlocEditor.ts", { type: "text/typescript" }),
        tag,
        "Commerce",
        "",
        runtimeTag,
        source,
    );
    return {
        ...compiled,
        viewSource: declaredBlocViewSources({ viewJS: view, source }),
        editorSource: editor,
    };
}

async function settleLifecycle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}
