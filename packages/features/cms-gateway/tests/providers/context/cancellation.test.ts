import { expect, test } from "bun:test";
import { requestContext } from "@bernouy/cms-gateway/protocol";
import { fixture } from "./fixture";

test("aborting a query cancels an incomplete structured Response body", async () => {
    const f = await fixture(false);
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
        started = resolve;
    });
    let cancelled = false;
    f.dispatcher.register(
        "catalog",
        "item.list",
        async () =>
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('{"items":['));
                        started();
                    },
                    cancel() {
                        cancelled = true;
                    },
                }),
                { headers: { "content-type": "application/json" } },
            ),
    );
    f.mount();
    const abort = new AbortController();
    const result = f.gateway.invoke({
        siteId: "site-a",
        contractId: "catalog",
        capabilityId: "item.list",
        input: {},
        actor: { kind: "anonymous" },
        signal: abort.signal,
    });
    const rejection = result.catch((error) => error);
    await ready;
    abort.abort();
    expect(await rejection).toMatchObject({ code: "transport_failure" });
    expect(cancelled).toBe(true);
});

test("the canonical HTTP view remains present for long resource URLs and snapshots current headers", async () => {
    const f = await fixture(true);
    f.dispatcher.register("catalog", "item.list", async (_input, context) => {
        expect(context.http.resource).toEqual({ method: "GET" });
        expect(context.http.transportRequest?.method).toBe("GET");
        expect(context).not.toHaveProperty("headers");
        context.http.headers.set("accept-language", "en");
        expect(context.requestContext?.headers["accept-language"]).toBe("en");
        return new Response("ok", { headers: { "content-type": "text/plain" } });
    });
    f.mount();
    const result = await f.gateway.invoke({
        siteId: "site-a",
        contractId: "catalog",
        capabilityId: "item.list",
        input: { fileId: "one" },
        actor: { kind: "anonymous" },
        requestContext: requestContext(new Request("https://site.test/?q=" + "%C3%A9".repeat(2000)), true),
    });
    expect(result.kind).toBe("binary");
    if (result.kind === "binary") {
        expect(await new Response(result.stream).text()).toBe("ok");
    }
});
