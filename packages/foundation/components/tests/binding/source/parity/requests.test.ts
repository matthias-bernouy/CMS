import { afterEach, expect, test } from "bun:test";
import { ReadRequests } from "../../../../src/binding/source/runtime/readRequests";
import { Source } from "../../../../src/binding/source/Source";
import { readSourceData } from "../../../../src/binding/source/values";
import { resetDom } from "../../testUtils";

afterEach(resetDom);

test("concurrent equivalent reads share a request and receive independent data", async () => {
    let release!: (response: Response) => void;
    let calls = 0;
    globalThis.fetch = (async () => {
        calls += 1;
        return new Promise<Response>((resolve) => {
            release = resolve;
        });
    }) as unknown as typeof fetch;
    const reads = new ReadRequests(document);
    const first = reads.read("/items?q=racket&limit=20", new AbortController().signal);
    const second = reads.read("/items?limit=20&q=racket", new AbortController().signal);
    expect(calls).toBe(1);
    release(Response.json({ items: ["first"] }));
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ kind: "success", data: { items: ["first"] } });
    expect(b).toEqual(a);
    if (a.kind === "success" && b.kind === "success") {
        expect(a.data).not.toBe(b.data);
    }
    const fresh = reads.read("/items?limit=20&q=racket", new AbortController().signal);
    expect(calls).toBe(2);
    release(Response.json({ items: ["updated"] }));
    expect(await fresh).toEqual({ kind: "success", data: { items: ["updated"] } });
});

test("automatic POST bindings send JSON input independently", async () => {
    const calls: Array<{ url: string; method: string | undefined; body: string | undefined }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body?.toString() });
        return Response.json({ items: ["one"] });
    }) as unknown as typeof fetch;
    const hosts = [document.createElement("div"), document.createElement("div")];
    for (const host of hosts) {
        host.setAttribute("cms-source", "/.cms/call/catalog/item.list");
        host.setAttribute("cms-source-method", "POST");
        host.setAttribute("cms-source-body", '{"term":{"from":"raw","value":"one"}}');
    }
    const sources = hosts.map((host) => new Source(host));
    try {
        await Promise.all(sources.map((source) => source.run()));
        expect(calls).toEqual([
            { url: "/.cms/call/catalog/item.list", method: "POST", body: '{"term":"one"}' },
            { url: "/.cms/call/catalog/item.list", method: "POST", body: '{"term":"one"}' },
        ]);
        expect(readSourceData(hosts[0]!)).toEqual({ items: ["one"] });
    } finally {
        sources.forEach((source) => source.dispose());
    }
});

test("one consumer can leave while another keeps the same request alive", async () => {
    let networkSignal!: AbortSignal;
    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
        networkSignal = init!.signal!;
        return new Promise<Response>((_resolve, reject) => {
            networkSignal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
    }) as unknown as typeof fetch;
    const reads = new ReadRequests(document);
    const first = new AbortController();
    const second = new AbortController();
    const a = reads.read("/items", first.signal);
    const b = reads.read("/items", second.signal);
    first.abort();
    expect(networkSignal.aborted).toBe(false);
    expect(await a).toEqual({ kind: "aborted" });
    second.abort();
    expect(networkSignal.aborted).toBe(true);
    expect(await b).toEqual({ kind: "aborted" });
});

test("failed reads can be retried and separate core pools never share reads", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
        calls += 1;
        return calls === 1 ? new Response("Unavailable", { status: 503 }) : Response.json({ ok: true });
    }) as unknown as typeof fetch;
    const reads = new ReadRequests(document);
    expect((await reads.read("/items", new AbortController().signal)).kind).toBe("error");
    expect((await reads.read("/items", new AbortController().signal)).kind).toBe("success");
    await Promise.all([
        reads.read("/items", new AbortController().signal),
        new ReadRequests(document).read("/items", new AbortController().signal),
    ]);
    expect(calls).toBe(4);
});

test("a URL changed before mutation delivery cannot accept the previous response", async () => {
    const pending = new Map<string, (response: Response) => void>();
    globalThis.fetch = (async (url: string) =>
        new Promise<Response>((resolve) => pending.set(url, resolve))) as unknown as typeof fetch;
    const host = document.createElement("div");
    host.setAttribute("cms-source", "/old");
    host.innerHTML = '<p cms-condition="$source.loaded">{{ name }}</p>';
    const source = new Source(host);
    try {
        const first = source.run();
        host.setAttribute("cms-source", "/current");
        pending.get("/old")!(Response.json({ name: "Obsolete" }));
        await first;
        expect(host.textContent).not.toContain("Obsolete");
        expect(readSourceData(host)).toBeUndefined();
        expect(pending.has("/current")).toBe(true);
        pending.get("/current")!(Response.json({ name: "Current" }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(host.textContent).toContain("Current");
        expect(readSourceData(host)).toEqual({ name: "Current" });
    } finally {
        source.dispose();
    }
});
