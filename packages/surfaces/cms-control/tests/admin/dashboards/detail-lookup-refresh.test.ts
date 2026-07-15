import { afterEach, describe, expect, test } from "bun:test";
import { changeDetailInput, waitForDetail } from "./detailTestHelpers";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard targeted lookup refresh", () => {
    test("reloads only lookups that depend on the changed field", async () => {
        const requests = installLookupResponses();
        const detail = detailElement([
            textField("postalCode", "Postal code"),
            lookupField("country", "Country", "countries"),
            lookupField("relayId", "Relay", "relayPoints", { postalCode: "$field.postalCode" }),
        ], { postalCode: "75000", country: "FR", relayId: "relay-1" });
        document.body.append(detail);
        await waitForDetail(() => requests.length === 2);

        changeDetailInput(detail, "postalCode", "75001");
        await waitForDetail(() => requests.length === 3, 80);

        const paths = requests.map(request => new URL(request.url).pathname);
        expect(paths.filter(path => path.endsWith("/countries"))).toHaveLength(1);
        expect(paths.filter(path => path.endsWith("/relayPoints"))).toHaveLength(2);
        expect(requests.at(-1)?.url).toContain("postalCode=75001");
    });

    test("unions dependent lookup keys across one debounce window", async () => {
        const requests = installLookupResponses();
        const detail = detailElement([
            textField("postalCode", "Postal code"),
            textField("city", "City"),
            lookupField("country", "Country", "countries"),
            lookupField("relayId", "Relay", "relayPoints", { postalCode: "$field.postalCode" }),
            lookupField("warehouseId", "Warehouse", "warehouses", { city: "$field.city" }),
        ], {
            postalCode: "75000",
            city: "Paris",
            country: "FR",
            relayId: "relay-1",
            warehouseId: "warehouse-1",
        });
        document.body.append(detail);
        await waitForDetail(() => requests.length === 3);

        changeDetailInput(detail, "postalCode", "75001");
        changeDetailInput(detail, "city", "Lyon");
        await waitForDetail(() => requests.length === 5, 80);

        const paths = requests.map(request => new URL(request.url).pathname);
        expect(paths.filter(path => path.endsWith("/countries"))).toHaveLength(1);
        expect(paths.filter(path => path.endsWith("/relayPoints"))).toHaveLength(2);
        expect(paths.filter(path => path.endsWith("/warehouses"))).toHaveLength(2);
        expect(requests.some(request => request.url.includes("postalCode=75001"))).toBeTrue();
        expect(requests.some(request => request.url.includes("city=Lyon"))).toBeTrue();
    });
});

function installLookupResponses(): Request[] {
    const requests: Request[] = [];
    globalThis.fetch = (async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path.endsWith("/countries")) return Response.json({ items: [{ id: "FR", label: "France" }] });
        if (path.endsWith("/warehouses")) return Response.json({ items: [{ id: "warehouse-1", label: "Warehouse" }] });
        return Response.json({ items: [{ id: "relay-1", label: "Relay" }] });
    }) as typeof fetch;
    return requests;
}

function detailElement(fields: unknown[], resource: Record<string, unknown>): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute("data-config-json", JSON.stringify({
        widget: "w-detail",
        id: "shipment",
        source: { endpoint: "shipment" },
        main: [{ id: "main", title: "Shipment", fields }],
    }));
    detail.setAttribute("data-source-id", "delivery");
    detail.setAttribute("data-source-json", JSON.stringify(resource));
    return detail;
}

function textField(id: string, label: string): unknown {
    return { id, label, path: id, type: "text" };
}

function lookupField(id: string, label: string, endpoint: string, params?: Record<string, string>): unknown {
    return {
        id,
        label,
        path: id,
        type: "combobox",
        lookup: { endpoint, params, itemsPath: "items", valuePath: "id", labelPath: "label" },
    };
}
