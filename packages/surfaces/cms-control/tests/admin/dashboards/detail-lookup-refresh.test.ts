import { afterEach, describe, expect, test } from "bun:test";
import { Button, Combobox, P9rInput, P9rSelect } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";

if (!customElements.get("p9r-input")) customElements.define("p9r-input", P9rInput);
if (!customElements.get("p9r-button")) customElements.define("p9r-button", Button);
if (!customElements.get("p9r-combobox")) customElements.define("p9r-combobox", Combobox);
if (!customElements.get("p9r-select")) customElements.define("p9r-select", P9rSelect);

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard targeted lookup refresh", () => {
    test("reloads only lookups that depend on the changed field", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            const path = new URL(request.url).pathname;
            return path.endsWith("/countries")
                ? Response.json({ items: [{ code: "FR", label: "France" }] })
                : Response.json({ items: [{ id: "relay-1", label: "Relay" }] });
        }) as typeof fetch;
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify({
            widget: "w-detail",
            id: "shipment",
            source: { endpoint: "shipment" },
            main: [{ id: "main", title: "Shipment", fields: [
                { id: "postalCode", label: "Postal code", path: "postalCode", type: "text" },
                { id: "country", label: "Country", path: "country", type: "combobox", lookup: {
                    endpoint: "countries", itemsPath: "items", valuePath: "code", labelPath: "label",
                } },
                { id: "relayId", label: "Relay", path: "relayId", type: "combobox", lookup: {
                    endpoint: "relayPoints", params: { postalCode: "$field.postalCode" },
                    itemsPath: "items", valuePath: "id", labelPath: "label",
                } },
            ] }],
        }));
        detail.setAttribute("data-source-id", "delivery");
        detail.setAttribute("data-source-json", JSON.stringify({
            postalCode: "75000", country: "FR", relayId: "relay-1",
        }));
        document.body.append(detail);
        await waitFor(() => requests.length === 2);

        const control = detail.shadowRoot!.querySelector<HTMLElement & { shadowRoot: ShadowRoot }>(
            "[data-field-control='postalCode']",
        )!;
        const input = control.shadowRoot.querySelector("input")!;
        input.value = "75001";
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await waitFor(() => requests.length === 3, 80);

        const paths = requests.map(request => new URL(request.url).pathname);
        expect(paths.filter(path => path.endsWith("/countries"))).toHaveLength(1);
        expect(paths.filter(path => path.endsWith("/relayPoints"))).toHaveLength(2);
        expect(requests.at(-1)?.url).toContain("postalCode=75001");
    });
});

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let index = 0; index < tries; index += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(predicate()).toBeTrue();
}
