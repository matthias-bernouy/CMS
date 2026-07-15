import { afterEach, describe, expect, test } from "bun:test";
import { changeDetailInput, waitForDetail } from "./detailTestHelpers";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard targeted lookup failures", () => {
    test("preserves valid options after a failed refresh and retries", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            const url = new URL(request.url);
            if (url.pathname.endsWith("/countries")) {
                return Response.json({ items: [{ id: "FR", label: "France" }] });
            }
            if (url.searchParams.get("postalCode") === "75001") {
                return new Response("temporary failure", { status: 503 });
            }
            const label = url.searchParams.get("postalCode") === "75002" ? "Relay updated" : "Relay initial";
            return Response.json({ items: [{ id: "relay-1", label }] });
        }) as typeof fetch;
        const detail = detailElement();
        document.body.append(detail);
        await waitForDetail(() => detail.shadowRoot?.querySelector("option[value='relay-1']")?.textContent === "Relay initial");

        changeDetailInput(detail, "postalCode", "75001");
        await waitForDetail(() => requests.length === 3, 80);
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(detail.shadowRoot?.querySelector("option[value='relay-1']")?.textContent).toBe("Relay initial");

        changeDetailInput(detail, "postalCode", "75002");
        await waitForDetail(() => detail.shadowRoot?.querySelector("option[value='relay-1']")?.textContent === "Relay updated", 80);
        const paths = requests.map(request => new URL(request.url).pathname);
        expect(paths.filter(path => path.endsWith("/countries"))).toHaveLength(1);
        expect(paths.filter(path => path.endsWith("/relayPoints"))).toHaveLength(3);
    });

    test("does not abort an independent lookup while a dependency changes", async () => {
        const signals = new Map<string, AbortSignal>();
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(String(input)).pathname;
            const signal = init?.signal;
            if (signal) signals.set(path, signal);
            return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        }) as unknown as typeof fetch;
        const detail = detailElement();
        document.body.append(detail);
        await waitForDetail(() => signals.size === 2);

        changeDetailInput(detail, "postalCode", "75001");
        const countrySignal = [...signals].find(([path]) => path.endsWith("/countries"))?.[1];
        const relaySignal = [...signals].find(([path]) => path.endsWith("/relayPoints"))?.[1];

        expect(relaySignal?.aborted).toBeTrue();
        expect(countrySignal?.aborted).toBeFalse();
    });
});

function detailElement(): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute("data-config-json", JSON.stringify({
        widget: "w-detail",
        id: "shipment",
        source: { endpoint: "shipment" },
        main: [{ id: "main", title: "Shipment", fields: [
            { id: "postalCode", label: "Postal code", path: "postalCode", type: "text" },
            { id: "country", label: "Country", path: "country", type: "combobox", lookup: {
                endpoint: "countries", itemsPath: "items", valuePath: "id", labelPath: "label",
            } },
            { id: "relayId", label: "Relay", path: "relayId", type: "combobox", lookup: {
                endpoint: "relayPoints",
                params: { postalCode: "$field.postalCode" },
                itemsPath: "items",
                valuePath: "id",
                labelPath: "label",
            } },
        ] }],
    }));
    detail.setAttribute("data-source-id", "delivery");
    detail.setAttribute("data-source-json", JSON.stringify({ postalCode: "75000", country: "FR", relayId: "relay-1" }));
    return detail;
}
