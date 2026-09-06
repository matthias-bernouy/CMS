import { expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

test("public offer copy reaches shadow content before loading or changing attributes", async () => {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    const artifact = definition?.artifacts?.find(
        (item) => item.type === "bloc" && item.bloc.tag === "mossa-public-offer-controller",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("Public offer controller source not found");
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        artifact.bloc.group ?? "Commerce",
        artifact.bloc.description ?? "",
        artifact.bloc.tag,
        artifact.bloc.source,
        undefined,
        { viewPath: artifact.bloc.view ?? "Bloc.ts" },
    );
    const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
    (window as typeof window & { p9r?: unknown }).p9r = {
        Component,
        clearResponsiveSourceImageElement,
        syncResponsiveSourceImageElement,
    };
    const previousFetch = globalThis.fetch;
    const previousUrl = location.href;
    history.replaceState({}, "", "?slug=sample-offer");
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return Response.json({
            id: 5,
            slug: "sample-offer",
            title: "Sample offer",
            availability: "available",
            acceptedPriceAmount: 2000,
            currency: "EUR",
            media: [],
            product: { title: "Sample model" },
        });
    }) as typeof fetch;
    let host: HTMLElement | undefined;
    try {
        if (!customElements.get("mossa-public-offer-controller")) {
            new Function(compiled.viewJS)();
        }
        host = document.createElement("mossa-public-offer-controller");
        host.innerHTML = '<a data-back href="#"></a><a data-buy></a><a data-negotiate></a>';
        host.setAttribute("model-label", "Product model");
        host.setAttribute("buy-url", "/checkout?offerId={id}");
        host.setAttribute("secure-payment-label", "Protected payment");
        host.setAttribute("buyer-protection-label", "Protected purchase");
        host.setAttribute("tracked-delivery-label", "Shipment tracking");
        document.body.append(host);
        const text = (name: string) => host?.shadowRoot?.querySelector(`[data-${name}-label]`)?.textContent;
        expect(text("secure-payment")).toBe("Protected payment");
        expect(text("buyer-protection")).toBe("Protected purchase");
        expect(text("tracked-delivery")).toBe("Shipment tracking");
        host.setAttribute("secure-payment-label", "Secure transaction");
        expect(text("secure-payment")).toBe("Secure transaction");
        host.removeAttribute("buyer-protection-label");
        expect(text("buyer-protection")).toBe("Buyer protection");
        await Bun.sleep(0);
        expect(requests).toEqual(["/.cms/sources/commerce/offer?slug=sample-offer"]);
        expect(host.shadowRoot?.querySelector<HTMLElement>("[data-content]")?.hidden).toBe(false);
        expect(host.shadowRoot?.querySelector("[data-specifications]")?.textContent).toContain("Product model");
        expect(host.shadowRoot?.querySelector("[data-specifications]")?.textContent).toContain("Sample model");
        expect(host.querySelector("[data-buy]")?.getAttribute("href")).toBe("/checkout?offerId=5");
    } finally {
        host?.remove();
        globalThis.fetch = previousFetch;
        history.replaceState({}, "", previousUrl);
        (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
    }
});
