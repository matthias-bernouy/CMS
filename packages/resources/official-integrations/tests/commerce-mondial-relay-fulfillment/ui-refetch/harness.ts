import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";

const blocDirectory = resolve(
    import.meta.dir,
    "../../../integrations/commerce-mondial-relay-fulfillment/versions/1.0.0/blocs/commerce-mondial-relay-sale-fulfillment",
);
const tag = "test-commerce-mondial-relay-sale-fulfillment-refetch";

export type RequestCall = {
    path: string;
    method: string;
    body: unknown;
};

export type TestFulfillmentBloc = HTMLElement & {
    createShipment(): Promise<void>;
    declareHandoff(): Promise<void>;
    load(): Promise<void>;
    request(path: string, init?: RequestInit): Promise<Record<string, unknown>>;
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
    await defineBloc();
    const calls: RequestCall[] = [];
    const bloc = document.createElement(tag) as TestFulfillmentBloc;
    bloc.setAttribute("order-id", String(order.orderId));
    bloc.request = async (path, init = {}) => {
        const call = {
            path,
            method: String(init.method ?? "GET"),
            body: init.body ? JSON.parse(String(init.body)) : undefined,
        };
        calls.push(call);
        return await responder(call);
    };
    bloc.syncPresentation();
    return { bloc, calls };
}

export function snapshot(bloc: TestFulfillmentBloc) {
    const root = bloc.shadowRoot;
    if (!root) {
        throw new Error("expected fulfillment shadow root");
    }
    const text = (selector: string) => root.querySelector(selector)?.textContent ?? "";
    const hidden = (selector: string) => (root.querySelector(selector) as HTMLElement | null)?.hidden;
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
        trackingUrl: root.querySelector("[data-tracking-link]")?.getAttribute("href"),
    };
}

async function defineBloc(): Promise<void> {
    if (customElements.get(tag)) {
        return;
    }
    Object.assign(((window as Window & { p9r?: Record<string, unknown> }).p9r ??= {}), { Component });
    const files = await readdir(blocDirectory);
    const view = await readFile(resolve(blocDirectory, "Bloc.ts"), "utf8");
    const editor = await readFile(resolve(blocDirectory, "BlocEditor.ts"), "utf8");
    const source: Record<string, string> = {};
    for (const file of files.filter((name) => !["Bloc.ts", "BlocEditor.ts"].includes(name))) {
        source[file] = Buffer.from(await readFile(resolve(blocDirectory, file))).toString("base64");
    }
    const compiled = await prepare_bloc(
        new File([view], "Bloc.ts", { type: "text/typescript" }),
        new File([editor], "BlocEditor.ts", { type: "text/typescript" }),
        tag,
        "Commerce Mondial Relay fulfillment",
        "",
        tag,
        source,
    );
    new Function(compiled.viewJS)();
}
