import { afterEach, describe, expect, test } from "bun:test";
import { waitForDetail } from "../../dashboards/detail/detailTestHelpers";
import { resetLookupTest } from "./lookupTestSetup";

afterEach(resetLookupTest);

describe("dashboard remote lookups", () => {
    test("searches and paginates without replacing the active combobox", async () => {
        const requests: URL[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            const url = new URL(request.url);
            requests.push(url);
            const query = url.searchParams.get("q") ?? "initial";
            const offset = Number(url.searchParams.get("skip") ?? 0);
            const count = offset === 25 ? 5 : 25;
            return Response.json({
                total: 30,
                items: Array.from({ length: count }, (_, index) => ({
                    id: `${query}-${offset + index}`,
                    title: `${query} ${offset + index}`,
                })),
            });
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify(remoteLookupWidget()));
        detail.setAttribute("data-source-json", JSON.stringify({ id: "offer-1", productId: "" }));
        detail.setAttribute("data-row-key", "offer-1");
        detail.setAttribute("data-source-id", "offers");
        document.body.append(detail);

        await waitForDetail(() => detail.shadowRoot!.querySelectorAll("p9r-combobox option").length === 25);
        const control = detail.shadowRoot!.querySelector<HTMLElement & { shadowRoot: ShadowRoot }>("p9r-combobox")!;
        expect(control.hasAttribute("remote-search")).toBeTrue();
        expect(control.hasAttribute("has-more")).toBeTrue();

        const input = control.shadowRoot.querySelector("input")!;
        let emittedQuery = "";
        control.addEventListener("combobox-search", (event) => {
            emittedQuery = (event as CustomEvent<{ query: string }>).detail.query;
        });
        input.focus();
        input.value = "racket";
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        expect(emittedQuery).toBe("racket");
        expect(control.hasAttribute("loading")).toBeTrue();
        await waitForDetail(() => Boolean(control.querySelector("option[value='racket-0']")), 80);

        expect(detail.shadowRoot!.querySelector("p9r-combobox")).toBe(control);
        expect(control.shadowRoot.activeElement).toBe(input);
        expect(requests.at(-1)?.searchParams.get("q")).toBe("racket");
        expect(requests.at(-1)?.searchParams.get("take")).toBe("25");
        expect(requests.at(-1)?.searchParams.get("skip")).toBe("0");

        control.shadowRoot
            .querySelector<HTMLButtonElement>(".load-more")!
            .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        await waitForDetail(() => Boolean(control.querySelector("option[value='racket-29']")));
        expect(requests.at(-1)?.searchParams.get("q")).toBe("racket");
        expect(requests.at(-1)?.searchParams.get("skip")).toBe("25");
        expect(control.querySelectorAll("option")).toHaveLength(30);
        expect(control.hasAttribute("has-more")).toBeFalse();
    });

    test("ignores a slower response from an obsolete search", async () => {
        const pending = new Map<string, (response: Response) => void>();
        globalThis.fetch = (async (input, init) => {
            const url = new URL(new Request(input, init).url);
            const query = url.searchParams.get("q");
            if (!query) {
                return Response.json({ items: [], total: 0 });
            }
            return await new Promise<Response>((resolve) => pending.set(query, resolve));
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify(remoteLookupWidget()));
        detail.setAttribute("data-source-json", JSON.stringify({ id: "offer-1", productId: "" }));
        detail.setAttribute("data-row-key", "offer-1");
        detail.setAttribute("data-source-id", "offers");
        document.body.append(detail);
        await waitForDetail(() => Boolean(detail.shadowRoot!.querySelector("p9r-combobox")));

        const control = detail.shadowRoot!.querySelector<HTMLElement & { shadowRoot: ShadowRoot }>("p9r-combobox")!;
        const input = control.shadowRoot.querySelector("input")!;
        input.focus();
        input.value = "old";
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await waitForDetail(() => pending.has("old"));
        input.value = "new";
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await waitForDetail(() => pending.has("new"));

        pending.get("new")!(Response.json({ items: [{ id: "new", title: "New result" }], total: 1 }));
        await waitForDetail(() => Boolean(control.querySelector("option[value='new']")));
        pending.get("old")!(Response.json({ items: [{ id: "old", title: "Old result" }], total: 1 }));
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(control.querySelector("option[value='old']")).toBeNull();
        expect(control.querySelector("option[value='new']")?.textContent).toBe("New result");
    });
});

function remoteLookupWidget(): unknown {
    return {
        widget: "w-detail",
        id: "offerDetail",
        source: { endpoint: "offer" },
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
                            params: { q: "$search", take: "$limit", skip: "$offset" },
                            itemsPath: "items",
                            totalPath: "total",
                            valuePath: "id",
                            labelPath: "title",
                        },
                    },
                ],
            },
        ],
    };
}
