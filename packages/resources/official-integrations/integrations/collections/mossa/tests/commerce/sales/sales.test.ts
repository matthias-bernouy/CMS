import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
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
import { syncSalePresentation } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/details/commerce-sale-detail/presentation.ts";

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
        (window as typeof window & { p9r?: unknown }).p9r = {
            Component,
            refreshSourceContext,
            setSourceContext,
        };
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
        const host = document.createElement("div") as HTMLElement & {
            locale: string;
            statusLabel(status: string): string;
            text(name: string, fallback: string): string;
        };
        host.locale = "fr-FR";
        host.statusLabel = () => "À traiter";
        host.text = (_name, fallback) => fallback;
        host.innerHTML = `
            <i
                data-sale-summary
                data-status="placed"
                data-currency="eur"
                data-financial-currency="eur"
                data-merchandise-subtotal-amount="11000"
                data-financial-shipping-amount="450"
                data-seller-commission-amount="550"
                data-platform-shipping-share-amount="450"
                data-seller-shipping-share-amount="0"
                data-seller-proceeds-amount="10450"
            ></i>
            <span data-order-number></span><span data-order-date></span><span data-order-status></span>
            <span data-subtotal></span><span data-commission></span><span data-shipping></span><span data-total></span>`;

        syncSalePresentation(host);
        expect(host.querySelector("[data-subtotal]")?.textContent).toBe(formatListMoney(11_000, "eur", "fr-FR"));
        expect(host.querySelector("[data-commission]")?.textContent).toBe(formatListMoney(-550, "eur", "fr-FR"));
        expect(host.querySelector("[data-shipping]")?.textContent).toBe("Covered by the platform");
        expect(host.querySelector("[data-total]")?.textContent).toBe(formatListMoney(10_450, "eur", "fr-FR"));
        expect(host.querySelector("[data-total]")?.textContent).not.toBe(formatListMoney(12_070, "eur", "fr-FR"));

        const summary = host.querySelector<HTMLElement>("[data-sale-summary]")!;
        summary.dataset.sellerCommissionAmount = "0";
        summary.dataset.platformShippingShareAmount = "0";
        summary.dataset.sellerShippingShareAmount = "450";
        summary.dataset.sellerProceedsAmount = "11450";
        syncSalePresentation(host);
        expect(host.querySelector("[data-commission]")?.textContent).toBe(formatListMoney(0, "eur", "fr-FR"));
        expect(host.querySelector("[data-shipping]")?.textContent).toBe("+4,50 €");
        expect(host.querySelector("[data-total]")?.textContent).toBe(formatListMoney(11_450, "eur", "fr-FR"));
    });

    test("keeps sale detail Commerce-only and exposes a fulfillment slot", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        if (!definition) {
            throw new Error("Mossa collection definition not found");
        }
        const artifacts =
            definition.artifacts?.filter(
                (item): item is Extract<typeof item, { type: "bloc" }> => item.type === "bloc",
            ) ?? [];
        const detail = artifacts?.find((artifact) => artifact.bloc.tag === "mossa-commerce-sale-detail");
        const controller = artifacts?.find((artifact) => artifact.bloc.tag === "mossa-commerce-sale-detail-controller");
        if (!detail?.bloc.compositionHTML || !detail.bloc.editorJS || !controller?.bloc.viewJS) {
            throw new Error("Commerce sale detail composition sources not found");
        }
        const viewSource = declaredBlocViewSources(controller.bloc);
        const runtime = `${detail.bloc.compositionHTML}\n${viewSource}`;
        expect(runtime).toContain("/.cms/sources/commerce/mySale?id=");
        expect(runtime).toContain('slot name="fulfillment"');
        expect(runtime).toContain("offerSnapshot");
        expect(viewSource).toContain("sellerCommissionAmount(order)");
        expect(viewSource).toContain("sellerShippingShareAmount(order)");
        expect(viewSource).toContain("sellerProceedsAmount(order)");
        expect(viewSource).toContain("salePresentationStatus(order)");
        expect(runtime).toContain("commerce-fulfillment:updated");
        expect(viewSource).not.toContain("formatMoney(order.totalAmount, order.currency");
        expect(runtime).toContain("Net amount to receive");
        expect(runtime).toContain("Platform commission");
        expect(runtime).toContain("Covered by the platform");
        expect(runtime).not.toContain('data-back action="link"');
        expect(viewSource).not.toContain("getShipmentForMySale");
        expect(viewSource).not.toContain("createShipmentForMySale");
        expect(viewSource).not.toContain("fetch(");
        expect(detail.bloc.editorJS).toContain('slot: "fulfillment"');
        expect(detail.bloc.editorJS).not.toContain('attribute: "sale-endpoint"');
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
