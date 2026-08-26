import { afterEach, describe, expect, test } from "bun:test";
import { resetLookupTest } from "./lookupTestSetup";

afterEach(resetLookupTest);

describe("dashboard detail widget actions", () => {
    test("reloads lookup options from current field values", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            const url = new URL(request.url);
            const postalCode = url.searchParams.get("postalCode");
            return Response.json({
                items: postalCode
                    ? [{ location: "FR-024474", label: `Relay ${postalCode}`, addressLine1: "85 BIS RUE REAUMUR" }]
                    : [],
            });
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "createShipmentForm",
                source: { endpoint: "setting", params: { id: "default" } },
                title: { path: "externalOrderId", fallback: "Create shipment" },
                main: [
                    {
                        id: "recipient",
                        title: "Recipient",
                        fields: [
                            {
                                id: "recipientCountry",
                                label: "Country",
                                path: "recipientCountry",
                                type: "select",
                                options: [{ value: "FR", label: "France" }],
                            },
                            {
                                id: "recipientPostalCode",
                                label: "Postal code",
                                path: "recipientPostalCode",
                                type: "text",
                            },
                            {
                                id: "deliveryRelayLocation",
                                label: "Pickup point",
                                path: "deliveryRelayLocation",
                                type: "combobox",
                                lookup: {
                                    endpoint: "relayPoints",
                                    params: {
                                        country: "$field.recipientCountry",
                                        postalCode: "$field.recipientPostalCode",
                                        limit: "10",
                                    },
                                    itemsPath: "items",
                                    valuePath: "location",
                                    labelPath: "label",
                                },
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute("data-source-json", JSON.stringify({ recipientCountry: "FR", recipientPostalCode: "" }));
        detail.setAttribute("data-row-key", "__new__");
        detail.setAttribute("data-source-id", "delivery");

        document.body.append(detail);
        await Promise.resolve();

        const inputEvents: string[] = [];
        detail.shadowRoot!.addEventListener("input", (event) => {
            inputEvents.push(
                event
                    .composedPath()
                    .find(
                        (target): target is HTMLElement =>
                            target instanceof HTMLElement && target.hasAttribute("data-field-control"),
                    )?.dataset.fieldControl ?? "",
            );
        });
        const postalCode = detail.shadowRoot!.querySelector<HTMLElement & { value: string; shadowRoot: ShadowRoot }>(
            "[data-field-control='recipientPostalCode']",
        )!;
        const nativePostalCode = postalCode.shadowRoot.querySelector("input")!;
        nativePostalCode.value = "75001";
        nativePostalCode.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(inputEvents).toContain("recipientPostalCode");
        expect(requests.at(-1)?.url).toContain("postalCode=75001");
        const combobox = detail.shadowRoot!.querySelector("p9r-combobox")!;
        expect(combobox.querySelector("option[value='FR-024474']")?.textContent).toBe("Relay 75001");
        expect(
            detail.shadowRoot!.querySelector<HTMLElement & { value: string }>(
                "[data-field-control='recipientPostalCode']",
            )!.value,
        ).toBe("75001");
    });

    test("loads lookup options from an explicit source id", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({
                items: [{ id: "product-1", title: "Racket", slug: "racket" }],
            });
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "offerDetail",
                source: { endpoint: "offer", params: { id: "$selection.id" } },
                title: { path: "title", fallback: "Offer" },
                main: [
                    {
                        id: "details",
                        title: "Details",
                        fields: [
                            {
                                id: "productId",
                                label: "Product",
                                path: "productId",
                                type: "combobox",
                                lookup: {
                                    sourceId: "products",
                                    endpoint: "products",
                                    params: { q: "$search", limit: "20" },
                                    itemsPath: "items",
                                    valuePath: "id",
                                    labelPath: "title",
                                    subtitlePath: "slug",
                                },
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute("data-source-json", JSON.stringify({ id: "offer-1", productId: "product-1" }));
        detail.setAttribute("data-row-key", "offer-1");
        detail.setAttribute("data-source-id", "offers");

        document.body.append(detail);
        await waitFor(() => Boolean(detail.shadowRoot!.querySelector("p9r-combobox option[value='product-1']")));

        expect(requests[0]?.url).toContain("/.cms/sources/products/products");
        expect(detail.shadowRoot!.querySelector("p9r-combobox option[value='product-1']")?.textContent).toBe("Racket");
    });
});

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(predicate()).toBe(true);
}
