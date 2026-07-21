import { afterEach, describe, expect, test } from "bun:test";
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
