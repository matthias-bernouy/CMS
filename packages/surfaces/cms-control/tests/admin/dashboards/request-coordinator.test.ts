import { afterEach, describe, expect, test } from "bun:test";
import { DetailResourceState } from "cms-control/components/admin/Resources/Dashboards/domain";
import { DetailRequestCoordinator } from "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/runtime/requests";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("dashboard detail request coordinator", () => {
    test("shares one in-flight request for canonical equivalent URLs", async () => {
        const responses: Array<(response: Response) => void> = [];
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return new Promise<Response>((resolve) => responses.push(resolve));
        }) as unknown as typeof fetch;
        const requests = new DetailRequestCoordinator();
        const first = requests.createConsumer();
        const second = requests.createConsumer();

        const firstResult = requests.load(
            first,
            "commerce",
            {
                endpoint: "products",
                params: { limit: "20", q: "racket" },
            },
            {},
        );
        const secondResult = requests.load(
            second,
            "commerce",
            {
                endpoint: "products",
                params: { q: "racket", limit: "20" },
            },
            {},
        );

        expect(calls).toBe(1);
        responses[0]!(Response.json({ items: [{ id: "product-1" }] }));
        expect(await Promise.all([firstResult, secondResult])).toEqual([
            { items: [{ id: "product-1" }] },
            { items: [{ id: "product-1" }] },
        ]);
    });

    test("aborts shared work only after every consumer releases it", async () => {
        let signal: AbortSignal | undefined;
        globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        }) as unknown as typeof fetch;
        const requests = new DetailRequestCoordinator();
        const first = requests.createConsumer();
        const second = requests.createConsumer();
        const ref = { endpoint: "products" };
        const pending = requests.load(first, "commerce", ref, {});
        void requests.load(second, "commerce", ref, {}).catch(() => undefined);

        requests.cancel(first);
        expect(signal?.aborted).toBeFalse();
        requests.cancel(second);
        expect(signal?.aborted).toBeTrue();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });

    test("removes failed requests so a retry starts a new call", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return calls === 1 ? new Response("temporary failure", { status: 503 }) : Response.json({ items: [] });
        }) as unknown as typeof fetch;
        const requests = new DetailRequestCoordinator();
        const consumer = requests.createConsumer();

        await expect(requests.load(consumer, "commerce", { endpoint: "products" }, {})).rejects.toThrow();
        expect(await requests.load(consumer, "commerce", { endpoint: "products" }, {})).toEqual({ items: [] });
        expect(calls).toBe(2);
    });
});

describe("dashboard detail resource state", () => {
    test("retains only an exact dashboard detail resource", () => {
        const resources = new DetailResourceState();
        const resource = { id: "product-1", title: "Updated product" };
        resources.set("products", "catalog", "productDetail", "product-1", resource);

        expect(resources.current("products", "catalog", { collection: "productDetail", row: "product-1" })).toEqual({
            sourceId: "products",
            dashboardId: "catalog",
            collection: "productDetail",
            row: "product-1",
            resource,
        });
        expect(resources.current("products", "catalog", { collection: "productDetail", row: "product-2" })).toBeNull();
        expect(resources.current("products", "catalog", { collection: "productDetail", row: "product-1" })).toBeNull();
    });

    test("invalidates a pending result when navigation clears its scope", () => {
        const resources = new DetailResourceState();
        const finish = resources.beginAction();

        resources.clear();

        expect(finish()).toBe("stale");
    });

    test("keeps every overlapping action on its historical reload path", () => {
        const resources = new DetailResourceState();
        const finishFirst = resources.beginAction();
        const finishSecond = resources.beginAction();

        expect(finishFirst()).toBe("reload");
        expect(finishSecond()).toBe("reload");
    });

    test("clears a rendered resource without invalidating active actions", () => {
        const resources = new DetailResourceState();
        resources.set("products", "catalog", "productDetail", "product-1", { id: "product-1" });
        const finish = resources.beginAction();

        resources.clearResource();

        expect(resources.current("products", "catalog", { collection: "productDetail", row: "product-1" })).toBeNull();
        expect(finish()).toBe("reuse");
    });

    test("retains the rendered resource until an action outcome replaces or reloads it", () => {
        const resources = new DetailResourceState();
        const resource = { id: "product-1", title: "Current title" };
        const detail = { collection: "productDetail", row: "product-1" };
        resources.set("products", "catalog", detail.collection, detail.row, resource);

        const finish = resources.beginAction();

        expect(resources.current("products", "catalog", detail)?.resource).toBe(resource);
        expect(finish()).toBe("reuse");
    });
});
