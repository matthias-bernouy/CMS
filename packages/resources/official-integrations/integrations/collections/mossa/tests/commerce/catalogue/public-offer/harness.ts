import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { expandCompositions } from "@bernouy/cms-content";
import { Component } from "@bernouy/components/base";
import { observeSource, readSourceData, refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { offer, product, schema } from "./fixtures";

let composition = "";

export async function mountOffer(
    options: { unavailable?: boolean; productUnavailable?: boolean; schemaUnavailable?: boolean } = {},
) {
    await loadRuntime();
    const originalUrl = location.href;
    const requests: string[] = [];
    history.replaceState({}, "", "?slug=sample-offer");

    const container = document.createElement("div");
    container.innerHTML = `<mossa-public-offer buy-url="/checkout?offerId={id}" negotiate-url="/negotiate?offerId={id}" valuation-minimum-field="estimate_floor" valuation-maximum-field="estimate_ceiling" valuation-currency="EUR"></mossa-public-offer>`;
    expandCompositions(container, [{ id: "mossa-public-offer", compositionHTML: composition }]);
    const host = container.firstElementChild as HTMLElement;

    for (const form of host.querySelectorAll<HTMLFormElement>("form[cms-source]")) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const source = form.getAttribute("cms-source")!;
            const params = new URLSearchParams();
            for (const input of form.querySelectorAll<HTMLInputElement>("[name]")) {
                params.append(input.name, input.value);
            }
            requests.push(params.size ? `${source}?${params}` : source);
            queueMicrotask(() => respond(form, options));
        });
    }
    document.body.append(host);
    await waitFor(() => host.querySelector<HTMLElement>("[data-content]")?.hidden === false);

    return {
        host,
        requests,
        dispose: () => {
            host.remove();
            history.replaceState({}, "", originalUrl);
        },
    };
}

async function loadRuntime(): Promise<void> {
    if (composition && customElements.get("mossa-public-offer-controller")) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    const artifacts = (definition?.artifacts ?? []).filter(
        (item): item is Extract<typeof item, { type: "bloc" }> => item.type === "bloc",
    );
    const offerArtifact = artifacts.find(({ bloc }) => bloc.tag === "mossa-public-offer");
    const controller = artifacts.find(({ bloc }) => bloc.tag === "mossa-public-offer-controller");
    if (!offerArtifact?.bloc.compositionHTML || !controller?.bloc.viewJS) {
        throw new Error("Public offer composition sources not found");
    }
    composition = offerArtifact.bloc.compositionHTML;
    if (customElements.get(controller.bloc.tag)) {
        return;
    }
    const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
    (window as typeof window & { p9r?: unknown }).p9r = {
        Component,
        clearResponsiveSourceImageElement,
        observeSource,
        readSourceData,
        refreshSourceContext,
        setSourceContext,
        syncResponsiveSourceImageElement,
    };
    try {
        const compiled = await prepare_bloc(
            new File([controller.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            controller.bloc.name,
            controller.bloc.group ?? "Commerce",
            controller.bloc.description ?? "",
            controller.bloc.tag,
            controller.bloc.source,
            undefined,
            { viewPath: controller.bloc.view ?? "controller/Bloc.ts" },
        );
        new Function(compiled.viewJS)();
    } finally {
        (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
    }
}

function respond(
    form: HTMLFormElement,
    options: { unavailable?: boolean; productUnavailable?: boolean; schemaUnavailable?: boolean },
): void {
    if (form.matches("[data-offer-source]")) {
        succeed(form, {
            ...offer,
            availability: options.unavailable ? "sold_out" : "available",
            ...(options.schemaUnavailable ? { specifications: [{ label: "Weight", value: 280, unit: "g" }] } : {}),
            ...(options.productUnavailable ? { product } : {}),
        });
    } else if (form.matches("[data-product-source]")) {
        options.productUnavailable ? fail(form) : succeed(form, product);
    } else if (form.matches("[data-schema-source]")) {
        options.schemaUnavailable ? fail(form) : succeed(form, schema);
    }
}

function succeed(form: HTMLFormElement, body: unknown): void {
    form.dispatchEvent(new CustomEvent("cms-source:success", { bubbles: true, detail: { body } }));
}

function fail(form: HTMLFormElement): void {
    form.dispatchEvent(new CustomEvent("cms-source:failed", { bubbles: true, detail: { message: "Unavailable" } }));
}

async function waitFor(predicate: () => boolean): Promise<void> {
    const deadline = performance.now() + 1000;
    while (!predicate()) {
        if (performance.now() > deadline) {
            throw new Error("The public offer did not finish loading");
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
}

export function specificationRows(host: HTMLElement): string[][] {
    return [...host.querySelectorAll("[data-specifications] mossa-specification")].map((row) => [
        row.querySelector('[slot="label"]')!.textContent!,
        row.querySelector('[slot="value"]')!.textContent!,
    ]);
}
