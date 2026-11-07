import { afterEach, expect, test } from "bun:test";
import { JournalDetails } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--request-journal/runtime/details/controller";
import { getLogDetail } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--request-journal/runtime/details/client";
import { callSteps } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--request-journal/runtime/calls";
import { renderJournal } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--request-journal/runtime/render";
import {
    operation,
    nestingDepth,
} from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--request-journal/runtime/presentation";
import type { LogEntry } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--request-journal/runtime/model";

const originalFetch = globalThis.fetch;
let details: JournalDetails | undefined;
afterEach(() => {
    details?.disconnect();
    details = undefined;
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const entry = (id: string, requestId = id): LogEntry => ({
    id,
    requestId,
    event: "http.request.completed",
    level: "info",
    service: "test",
    time: "2026-11-06T10:00:00.000Z",
    durationMs: 120,
});
function fixture(entries: LogEntry[]): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = "<div data-summary></div><div data-results></div>";
    document.body.append(root);
    details = new JournalDetails(root, (key) => key);
    details.setEntries(entries);
    renderJournal(root, entries, true, (key) => key, details.lookup);
    return root;
}
function open(root: HTMLElement, index = 0): void {
    const node = root.querySelectorAll<HTMLDetailsElement>('[part~="request"]')[index]!;
    node.open = true;
    node.dispatchEvent(new Event("toggle"));
}
test("operations use available invocation metadata, preserve ambiguity and bound cyclic nesting", () => {
    const gateway = {
        ...entry("g"),
        capabilityId: "resolve",
        contractId: "undefined",
        invocationId: "child",
        parentInvocationId: "root",
    };
    const provider = { ...gateway, id: "p", contractId: "ulvia/cms.access" };
    expect(operation(gateway, [gateway, provider])).toBe("ulvia/cms.access · resolve");
    expect(operation(gateway, [gateway, provider, { ...provider, contractId: "other/contract" }])).toBe("resolve");
    expect(
        nestingDepth(gateway, [{ ...gateway, invocationId: "root", parentInvocationId: "child" }]),
    ).toBeLessThanOrEqual(2);
});
test("opening a request loads only its HTTP detail and reuses it on reopening", async () => {
    let calls = 0;
    globalThis.fetch = (async (_url, init) => {
        calls++;
        const { id } = JSON.parse(String(init?.body));
        return Response.json({ ...entry(id), attributes: { method: "POST", path: "/.cms/mcp", status: "200" } });
    }) as typeof fetch;
    const root = fixture([
        entry("http"),
        { ...entry("step", "http"), event: "gateway.invocation.completed", capabilityId: "pages.list" },
    ]);
    expect(calls).toBe(0);
    open(root);
    await tick();
    expect(calls).toBe(1);
    expect(root.querySelector('[part~="request-title"]')?.textContent).toBe("POST /.cms/mcp");
    expect(root.querySelector("[data-http-status]")?.textContent).toBe("HTTP 200");
    const request = root.querySelector<HTMLDetailsElement>('[part~="request"]')!;
    request.open = false;
    open(root);
    await tick();
    expect(calls).toBe(1);
    expect(root.querySelectorAll("a, button")).toHaveLength(0);
    expect(root.querySelectorAll('[part~="entry-row"]')).toHaveLength(1);
    expect(root.textContent?.split("http").length).toBeLessThanOrEqual(3);
});
test("detail concurrency is capped at three and changing the batch cancels pending work and discards its cache", async () => {
    const calls: { signal: AbortSignal; resolve: (response: Response) => void; id: string }[] = [];
    globalThis.fetch = ((_url, init) =>
        new Promise<Response>((resolve) => {
            calls.push({ resolve, signal: init?.signal as AbortSignal, id: JSON.parse(String(init?.body)).id });
        })) as typeof fetch;
    const root = fixture(Array.from({ length: 5 }, (_, index) => entry(`id-${index}`)));
    for (let index = 0; index < 5; index++) {
        open(root, index);
    }
    expect(calls).toHaveLength(3);
    details?.setEntries([]);
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
    for (const call of calls) {
        call.resolve(Response.json({ ...entry(call.id), attributes: { method: "GET", path: "/stale" } }));
    }
    await tick();
    expect(calls).toHaveLength(3);
    expect(details?.lookup("id-0")).toBeUndefined();
    expect(root.textContent).not.toContain("/stale");
});
test("an unsuccessful detail is retried explicitly and never displays the server error body", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
        calls++;
        return calls === 1
            ? Response.json({ secret: "private body" }, { status: 403 })
            : Response.json({ ...entry("http"), attributes: { method: "GET", path: "/ok" } });
    }) as typeof fetch;
    const root = fixture([entry("http")]);
    open(root);
    await tick();
    expect(root.textContent).not.toContain("private body");
    root.querySelector<HTMLDetailsElement>('[part~="request"]')!.open = false;
    open(root);
    await tick();
    expect(calls).toBe(2);
    expect(root.querySelector('[part~="request-title"]')?.textContent).toBe("GET /ok");
});
test("oversized detail bodies release their stream and foreign entry responses are refused", async () => {
    let canceled = false;
    globalThis.fetch = (async () =>
        new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(65_537));
                },
                cancel() {
                    canceled = true;
                },
            }),
        )) as typeof fetch;
    await expect(getLogDetail("id", new AbortController().signal)).rejects.toThrow("bound");
    expect(canceled).toBe(true);
    globalThis.fetch = (async () => Response.json({ ...entry("foreign"), attributes: {} })) as typeof fetch;
    await expect(getLogDetail("id", new AbortController().signal)).rejects.toThrow("Invalid");
});
test("gateway and Provider observations merge only for an unambiguous invocation and preserve execution duration", () => {
    const gateway = {
        ...entry("g", "r"),
        event: "gateway.invocation.completed",
        invocationId: "call",
        capabilityId: "pages.list",
        durationMs: 120,
    };
    const provider = { ...gateway, id: "p", event: "provider.capability.completed", durationMs: 0 };
    expect(callSteps([gateway, provider, entry("http", "r")])).toMatchObject([
        { entry: { id: "g", durationMs: 120 }, executionMs: 0 },
    ]);
    expect(callSteps([gateway, provider, { ...provider, id: "ambiguous" }])).toHaveLength(3);
    expect(
        callSteps([
            { ...gateway, invocationId: undefined },
            { ...provider, invocationId: undefined },
        ]),
    ).toHaveLength(2);
});

test("one request expansion displays an error directly without step links or repeated service and request IDs", async () => {
    const failure = {
        ...entry("failed", "request-a"),
        event: "provider.capability.failed",
        level: "error",
        capabilityId: "workspace.get",
    };
    let calls = 0;
    globalThis.fetch = (async () => {
        calls++;
        return Response.json({
            ...failure,
            attributes: {},
            error: { name: "Unavailable", message: "<script>private failure</script>" },
        });
    }) as typeof fetch;
    const root = fixture([failure]);
    open(root);
    await tick();
    expect(calls).toBe(1);
    expect(root.querySelector("script, a, button")).toBeNull();
    expect(root.textContent).toContain("<script>private failure</script>");
    expect(root.textContent).not.toContain("test");
    expect(root.textContent?.split("request-a")).toHaveLength(2);
});
