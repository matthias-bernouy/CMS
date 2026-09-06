import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { offer, product, schema } from "./fixtures";

const tag = "test-public-offer-product-specifications";

export async function mountOffer(
    options: { unavailable?: boolean; productUnavailable?: boolean; schemaUnavailable?: boolean } = {},
) {
    const originalFetch = globalThis.fetch;
    const originalUrl = location.href;
    const originalP9r = (window as typeof window & { p9r?: unknown }).p9r;
    (window as typeof window & { p9r?: unknown }).p9r = {
        Component,
        clearResponsiveSourceImageElement,
        syncResponsiveSourceImageElement,
    };
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const path = String(input);
        requests.push(path);
        if (path.startsWith("/.cms/sources/commerce/offer?")) {
            return Response.json({
                ...offer,
                availability: options.unavailable ? "sold_out" : "available",
                ...(options.schemaUnavailable ? { specifications: [{ label: "Weight", value: 280, unit: "g" }] } : {}),
                ...(options.productUnavailable ? { product } : {}),
            });
        }
        if (path.startsWith("/.cms/sources/commerce/product?")) {
            return options.productUnavailable ? Response.json({}, { status: 404 }) : Response.json(product);
        }
        if (path.startsWith("/.cms/sources/commerce/offerFilterSchema?")) {
            return options.schemaUnavailable ? Response.json({}, { status: 503 }) : Response.json(schema);
        }
        throw new Error(`Unexpected Source request: ${path}`);
    }) as typeof fetch;
    let host: HTMLElement | undefined;
    const dispose = () => {
        host?.remove();
        globalThis.fetch = originalFetch;
        history.replaceState({}, "", originalUrl);
        (window as typeof window & { p9r?: unknown }).p9r = originalP9r;
    };
    try {
        await defineController();
        history.replaceState({}, "", "?slug=sample-offer");
        host = document.createElement(tag);
        host.innerHTML = "<a data-back></a><a data-buy></a><a data-negotiate></a>";
        host.setAttribute("buy-url", "/checkout?offerId={id}");
        host.setAttribute("negotiate-url", "/negotiate?offerId={id}");
        host.setAttribute("valuation-minimum-field", "estimate_floor");
        host.setAttribute("valuation-maximum-field", "estimate_ceiling");
        host.setAttribute("valuation-currency", "EUR");
        document.body.append(host);
        const deadline = performance.now() + 1000;
        while (host.shadowRoot?.querySelector<HTMLElement>("[data-content]")?.hidden) {
            if (performance.now() > deadline) {
                throw new Error("The public offer did not finish loading");
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return { host, requests, dispose };
    } catch (error) {
        dispose();
        throw error;
    }
}

async function defineController(): Promise<void> {
    if (customElements.get(tag)) {
        return;
    }
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
        tag,
        artifact.bloc.source,
        undefined,
        { viewPath: artifact.bloc.view ?? "Bloc.ts" },
    );
    new Function(compiled.viewJS)();
}

export function specificationRows(host: HTMLElement): string[][] {
    return [...host.shadowRoot!.querySelectorAll("[data-specifications] mossa-specification")].map((row) => [
        row.querySelector('[slot="label"]')!.textContent!,
        row.querySelector('[slot="value"]')!.textContent!,
    ]);
}
