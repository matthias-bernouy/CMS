import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    createResponsiveSourceImageBrowserApi,
    installBoundImageRuntime,
    type BoundImageRuntime,
} from "@bernouy/cms-source-images/browser-host";

const tag = "test-commerce-negotiation-list-checkout";
const agreementId = "018f72b8-1f90-7c31-a933-592c90c8178a";
let imageRuntime: BoundImageRuntime;
let listTemplateHTML = "";

beforeEach(() => {
    imageRuntime = installBoundImageRuntime(
        document,
        createResponsiveSourceImageBrowserApi({ public: true, private: true }),
    );
});

afterEach(() => {
    imageRuntime.disconnect();
    document.querySelectorAll(tag).forEach((element) => element.remove());
});

describe("commerce negotiation list buyer checkout", () => {
    test("shows sent and received proposals together in an intrinsic whole-unit grid", async () => {
        await defineList();
        const realFetch = globalThis.fetch;
        const requests: URL[] = [];
        globalThis.fetch = (input) => {
            requests.push(new URL(String(input)));
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        items: [
                            acceptedProposal,
                            {
                                ...acceptedProposal,
                                id: 8,
                                publicId: "proposal-8",
                                viewerRole: "seller",
                                status: "pending",
                                agreementId: null,
                                checkoutStatus: null,
                                acceptedAt: null,
                            },
                        ],
                        total: 2,
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
            );
        };
        const list = createList();
        list.setAttribute("initial-role", "all");
        list.setAttribute("show-role-tabs", "false");
        list.setAttribute("grid-packing", "fill");
        list.setAttribute("grid-max", "lg");
        list.setAttribute("whole-unit-prices", "true");
        try {
            document.body.append(list);
            await settleLifecycle();

            expect(requests).toHaveLength(1);
            expect(requests[0].searchParams.has("role")).toBe(false);
            expect(list.querySelector("[data-items]")?.getAttribute("packing")).toBe("fill");
            expect(list.querySelector("[data-items]")?.getAttribute("max")).toBe("lg");
            expect(Array.from(list.querySelectorAll("[data-direction]"), (item) => item.textContent)).toEqual([
                "Offre envoyée",
                "Offre reçue",
            ]);
            expect(Array.from(list.querySelectorAll("[data-proposed-amount]"), (item) => item.textContent)).toEqual([
                "120 €",
                "120 €",
            ]);
            const cards = list.querySelectorAll<HTMLElement>("[data-proposal-card]");
            expect(cards[0].querySelector<HTMLElement>('[data-action-link="checkout"]')?.hidden).toBe(false);
            expect(cards[1].querySelector<HTMLElement>('[data-action="accept"]')?.hidden).toBe(false);
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("links an active accepted agreement to checkout without exposing a client amount", async () => {
        await defineList();
        const realFetch = globalThis.fetch;
        const requests: Array<{ url: URL; method: string }> = [];
        globalThis.fetch = (input, init) => {
            requests.push({ url: new URL(String(input)), method: init?.method || "GET" });
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        items: [acceptedProposal],
                        total: 1,
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
            );
        };

        const list = createList();
        list.setAttribute("initial-role", "buyer");
        list.setAttribute("checkout-url", "/checkout");
        list.setAttribute("checkout-param", "agreementId");
        try {
            document.body.append(list);
            await settleLifecycle();

            expect(requests).toHaveLength(1);
            const checkout = list.querySelector<HTMLElement>('[data-action-link="checkout"]');
            expect(checkout?.hasAttribute("hidden")).toBe(false);
            expect(checkout?.getAttribute("href")).toBe(`/checkout?agreementId=${agreementId}`);
            expect(checkout?.getAttribute("href")).not.toContain("offerId");
            expect(checkout?.getAttribute("href")).not.toContain("12000");
            expect(checkout?.textContent?.trim()).toBe("Finaliser l’achat — 120,00 €");

            expect(list.querySelector("[data-status]")?.textContent).toBe("Acceptée");
            expect(list.querySelector('basic-option[value="accepted"]')?.textContent).toBe("Acceptées");
            expect(list.querySelector<HTMLElement>("[data-expiration]")?.hasAttribute("hidden")).toBe(true);
            expect(list.querySelector("[data-decision]")?.textContent).toContain("Acceptée le");
            expect(list.querySelector("[data-offer-title-link]")?.getAttribute("href")).toBe(
                "/annonce?slug=wilson-blade",
            );
            const image = list.querySelector<HTMLImageElement>("[data-offer-image]");
            expect(image?.getAttribute("data-cms-src")).toBe("/.cms/sources/commerce/publicOfferImage?id=17");
            expect(image?.getAttribute("data-source-image-access")).toBe("public");
            expect(image?.getAttribute("data-source-width")).toBe("1200");
            expect(image?.getAttribute("data-source-height")).toBe("800");
            expect(image?.getAttribute("width")).toBe("1200");
            expect(image?.getAttribute("height")).toBe("800");
            expect(image?.getAttribute("sizes")).toBe("auto, 100vw");
            expect(image?.getAttribute("srcset")).toContain("cms-width=1024 1024w");
            expect(image?.getAttribute("srcset")).not.toContain("1280w");
            expect(image?.getAttribute("src")).toBe("/.cms/sources/commerce/publicOfferImage?id=17");
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("does not expose checkout to sellers or non-active agreements", async () => {
        await defineList();
        const realFetch = globalThis.fetch;
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        items: [{ ...acceptedProposal, checkoutStatus: "expired" }],
                        total: 1,
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
            );
        const list = createList();
        list.setAttribute("initial-role", "seller");
        try {
            document.body.append(list);
            await settleLifecycle();
            expect(list.querySelector<HTMLElement>('[data-action-link="checkout"]')?.hasAttribute("hidden")).toBe(true);
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("falls back only for historical dimensions and keeps absent media network-dark", async () => {
        await defineList();
        const realFetch = globalThis.fetch;
        globalThis.fetch = () =>
            Promise.resolve(
                Response.json({
                    items: [
                        {
                            ...acceptedProposal,
                            offerMainImageWidth: null,
                            offerMainImageHeight: null,
                        },
                        {
                            ...acceptedProposal,
                            id: 8,
                            publicId: "proposal-8",
                            offerMainImageMediaId: null,
                            offerMainImageWidth: null,
                            offerMainImageHeight: null,
                        },
                    ],
                    total: 2,
                }),
            );
        const list = createList();
        try {
            document.body.append(list);
            await settleLifecycle();

            const images = list.querySelectorAll<HTMLImageElement>("[data-offer-image]");
            expect(images[0].getAttribute("src")).toBe("/.cms/sources/commerce/publicOfferImage?id=17");
            expect(images[0].getAttribute("data-cms-src")).toBe("/.cms/sources/commerce/publicOfferImage?id=17");
            expect(images[0].getAttribute("data-source-image-access")).toBe("public");
            expect(images[0].hasAttribute("srcset")).toBe(false);
            expect(images[0].hasAttribute("data-source-width")).toBe(false);
            expect(images[1].hasAttribute("data-cms-src")).toBe(false);
            expect(images[1].hasAttribute("src")).toBe(false);
            expect(images[1].hasAttribute("srcset")).toBe(false);
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("links a consumed agreement to its public order detail", async () => {
        await defineList();
        const realFetch = globalThis.fetch;
        const orderId = "019fa219-76bc-7dcf-8a1b-a250cd132f3c";
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        items: [
                            {
                                ...acceptedProposal,
                                checkoutStatus: "consumed",
                                orderId,
                                consumedAt: "2026-07-21T12:01:00.000Z",
                            },
                        ],
                        total: 1,
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
            );
        const list = createList();
        list.setAttribute("initial-role", "buyer");
        try {
            document.body.append(list);
            await settleLifecycle();
            const checkout = list.querySelector<HTMLElement>('[data-action-link="checkout"]');
            const order = list.querySelector<HTMLElement>('[data-action-link="order"]');
            expect(checkout?.hasAttribute("hidden")).toBe(true);
            expect(order?.hasAttribute("hidden")).toBe(false);
            expect(order?.getAttribute("href")).toBe(`/mon-espace/commande?orderId=${orderId}`);
            expect(order?.getAttribute("href")).not.toContain("=42");
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("does not mutate a proposal when its confirmation is canceled", async () => {
        await defineList();
        const realFetch = globalThis.fetch;
        const realConfirm = window.confirm;
        const requests: Array<{ method: string; body: string | null }> = [];
        const confirmations: string[] = [];
        globalThis.fetch = (_input, init) => {
            requests.push({
                method: init?.method || "GET",
                body: typeof init?.body === "string" ? init.body : null,
            });
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        items: [
                            {
                                ...acceptedProposal,
                                status: "pending",
                                viewerRole: "seller",
                                agreementId: null,
                                checkoutStatus: null,
                                acceptedAt: null,
                            },
                        ],
                        total: 1,
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
            );
        };
        window.confirm = (message) => {
            confirmations.push(String(message));
            return false;
        };
        const list = createList();
        list.setAttribute("initial-role", "seller");
        try {
            document.body.append(list);
            await settleLifecycle();
            list.querySelector<HTMLElement>('[data-action="accept"]')?.dispatchEvent(
                new MouseEvent("click", { bubbles: true, composed: true }),
            );
            await settleLifecycle();

            expect(confirmations).toEqual(["Accepter l’offre de 120,00 € ?"]);
            expect(requests).toEqual([{ method: "GET", body: null }]);
        } finally {
            list.remove();
            window.confirm = realConfirm;
            globalThis.fetch = realFetch;
        }
    });
});

const acceptedProposal = {
    id: 7,
    publicId: "proposal-7",
    agreementId,
    offerId: 42,
    offerSlug: "wilson-blade",
    offerTitle: "Wilson Blade",
    offerMainImageMediaId: 17,
    offerMainImageWidth: 1200,
    offerMainImageHeight: 800,
    sellerUserId: "seller",
    sellerDisplayName: "Seller",
    buyerUserId: "buyer",
    viewerRole: "buyer",
    referenceAmount: 11_000,
    minimumAmount: 8_000,
    maximumAmount: 12_000,
    proposedAmount: 12_000,
    currency: "eur",
    buyerMessage: null,
    decisionMessage: null,
    status: "accepted",
    version: 2,
    expiresAt: "2026-07-22T12:00:00.000Z",
    acceptedAt: "2026-07-21T12:00:00.000Z",
    rejectedAt: null,
    withdrawnAt: null,
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-21T12:00:00.000Z",
    checkoutStatus: "active",
    checkoutExpiresAt: "2026-07-24T12:00:00.000Z",
    orderId: null,
    consumedAt: null,
};

async function defineList(): Promise<void> {
    if (customElements.get(tag)) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "commerce-negotiation",
    );
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "commerce-negotiation-list",
    );
    const controller = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "commerce-negotiation-list-controller",
    );
    if (
        !artifact ||
        artifact.type !== "bloc" ||
        artifact.bloc.compositionHTML === undefined ||
        !controller ||
        controller.type !== "bloc" ||
        !controller.bloc.viewJS
    ) {
        throw new Error("commerce-negotiation-list composition sources not found");
    }
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
    const composition = document.createElement("div");
    composition.innerHTML = artifact.bloc.compositionHTML;
    listTemplateHTML = composition.firstElementChild?.innerHTML ?? "";
    const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
    (window as typeof window & { p9r?: unknown }).p9r = {
        Component,
    };
    try {
        new Function(compiled.viewJS)();
    } finally {
        (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
    }
}

function createList(): HTMLElement {
    const list = document.createElement(tag);
    list.innerHTML = listTemplateHTML;
    return list;
}

async function settleLifecycle(): Promise<void> {
    for (let turn = 0; turn < 3; turn += 1) {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
