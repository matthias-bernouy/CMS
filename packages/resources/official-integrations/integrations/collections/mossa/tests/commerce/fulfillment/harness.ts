import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { expandCompositions } from "@bernouy/cms-content";
import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { resolve } from "node:path";

let composition = "";
let defaultContent = "";

export type RequestCall = {
    path: string;
    method: string;
    body: unknown;
};

export type TestFulfillmentBloc = HTMLElement & {
    load(): void;
    syncPresentation(): void;
};

export const order = {
    orderId: 42,
    orderPublicId: "order-public-42",
    orderNumber: "SALE-2026-0042",
};

export const shipment = {
    id: "shipment-42",
    expeditionNumber: "12345678",
    status: "label_ready",
    trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678",
    deliveryRelayLocation: "FR-001234",
    latestEventLabel: null,
    latestEventAt: null,
    carrierAcceptedAt: null,
    sellerHandoffDeclaredAt: null,
    recipientHandoffAt: null,
    createdAt: "2026-07-20T09:00:00.000Z",
    events: [],
};

export async function createBloc(
    responder: (call: RequestCall) => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<{ bloc: TestFulfillmentBloc; calls: RequestCall[] }> {
    await loadRuntime();
    const calls: RequestCall[] = [];
    const container = document.createElement("div");
    container.innerHTML = defaultContent;
    expandCompositions(container, [
        { id: "mossa-commerce-mondial-relay-sale-fulfillment", compositionHTML: composition },
    ]);
    const bloc = container.firstElementChild as TestFulfillmentBloc;
    bloc.setAttribute("order-id", String(order.orderId));

    for (const form of bloc.querySelectorAll<HTMLFormElement>("form[cms-source]")) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const method = form.getAttribute("cms-source-method") || "GET";
            const data = Object.fromEntries(
                [...form.querySelectorAll<HTMLInputElement>("[name]")].map((input) => [input.name, input.value]),
            );
            const params = new URLSearchParams(data);
            const source = form.getAttribute("cms-source")!;
            const call = {
                path: method === "GET" && params.size ? `${source}?${params}` : source,
                method,
                body: method === "GET" ? undefined : data,
            };
            calls.push(call);
            Promise.resolve()
                .then(() => responder(call))
                .then(
                    (body) => succeed(form, body),
                    (error) => fail(form, error),
                );
        });
    }
    return { bloc, calls };
}

export function snapshot(bloc: TestFulfillmentBloc) {
    const text = (selector: string) => bloc.querySelector(selector)?.textContent ?? "";
    const hidden = (selector: string) => bloc.querySelector<HTMLElement>(selector)?.hidden;
    return {
        orderNumber: text("[data-order-number]"),
        status: text("[data-status]"),
        expeditionNumber: text("[data-expedition]"),
        latest: text("[data-latest]"),
        message: text("[data-message]"),
        contentHidden: hidden("[data-content]"),
        createHidden: hidden("[data-create]"),
        handoffHidden: hidden("[data-handoff]"),
        labelHidden: hidden("[data-label]"),
        trackingHidden: hidden("[data-tracking-link]"),
        trackingUrl: bloc.querySelector("[data-tracking-link]")?.getAttribute("href"),
    };
}

async function loadRuntime(): Promise<void> {
    if (composition && customElements.get("mossa-commerce-mondial-relay-sale-fulfillment-controller")) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    const artifacts = (definition?.artifacts ?? []).filter(
        (item): item is Extract<typeof item, { type: "bloc" }> => item.type === "bloc",
    );
    const publicArtifact = artifacts.find(({ bloc }) => bloc.tag === "mossa-commerce-mondial-relay-sale-fulfillment");
    const controller = artifacts.find(
        ({ bloc }) => bloc.tag === "mossa-commerce-mondial-relay-sale-fulfillment-controller",
    );
    if (!publicArtifact?.bloc.compositionHTML || !controller?.bloc.viewJS) {
        throw new Error("Fulfillment composition sources not found");
    }
    composition = publicArtifact.bloc.compositionHTML;
    defaultContent = await Bun.file(
        resolve(
            OFFICIAL_INTEGRATIONS_ROOT,
            "collections/mossa/blocs/domains/commerce/fulfillment/commerce-mondial-relay-sale-fulfillment/default.html",
        ),
    ).text();
    if (customElements.get(controller.bloc.tag)) {
        return;
    }
    const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
    (window as typeof window & { p9r?: unknown }).p9r = {
        Component,
        refreshSourceContext,
        setSourceContext,
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

function succeed(form: HTMLFormElement, body: unknown): void {
    form.dispatchEvent(new CustomEvent("cms-source:success", { bubbles: true, detail: { body } }));
}

function fail(form: HTMLFormElement, error: unknown): void {
    form.dispatchEvent(
        new CustomEvent("cms-source:failed", {
            bubbles: true,
            detail: { message: error instanceof Error ? error.message : "Unavailable" },
        }),
    );
}
