import { afterEach, expect, test } from "bun:test";
import { mount } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--log-journal/bloc";
import {
    groupLogs,
    formatDuration,
} from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--log-journal/runtime/model";
import type { LogEntry } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--log-journal/runtime/model";
import { renderJournal } from "../../../../../official-repository/collections/mossa/blocs/data/journal/ulvia--mossa--log-journal/runtime/render";
import { validRange } from "../../../../../official-repository/collections/mossa/blocs/forms/fields/advanced/ulvia--mossa--date-range/runtime/range";

const originalFetch = globalThis.fetch;
let cleanup: (() => void) | undefined;
afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
});

const entry = (id: string, durationMs?: number, requestId?: string, event = "step"): LogEntry => ({
    id,
    durationMs,
    requestId,
    event,
    level: "info",
    service: "test",
    time: "2026-11-06T10:00:00.000Z",
});

test("request groups use measured HTTP duration without summing steps or merging missing IDs", () => {
    const groups = groupLogs([
        entry("a", 800, "req"),
        entry("b", 842, "req", "http.request.completed"),
        { ...entry("c", 730, "req"), level: "error" },
        entry("d", 0),
        entry("e"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ id: "req", durationMs: 842, level: "error" });
    expect(groups[1]?.durationMs).toBeUndefined();
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(2150, "fr")).toBe("2,15 s");
    expect(
        groupLogs([entry("a", 10, "r", "http.request.completed"), entry("b", 20, "r", "http.request.completed")])[0]
            ?.durationMs,
    ).toBe(20);
});

test("period validation refuses reversed, equal and invalid boundaries", () => {
    expect(validRange("bad", "2026-11-06T10:00Z")).toBeNull();
    expect(validRange("2026-11-06T11:00Z", "2026-11-06T10:00Z")).toBeNull();
    expect(validRange("2026-11-06T10:00Z", "2026-11-06T10:00Z")).toBeNull();
    expect(validRange("2026-11-06T10:00Z", "2026-11-06T11:00Z")?.from).toBe("2026-11-06T10:00:00.000Z");
});

test("journal renders untrusted text safely and only expands already loaded entries", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p data-summary></p><div data-results></div>";
    root.setAttribute("detail-path", "javascript:alert(1)");
    document.body.append(root);
    const records = [entry("a", 0, "<script>bad</script>", '<img src=x onerror="bad()">')];
    renderJournal(root, records, true, (key) => key);
    expect(root.querySelector("script, img, a")).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror="bad()">');
    const request = root.querySelector("details");
    if (!request) {
        throw new Error("Missing request disclosure");
    }
    request.open = true;
    renderJournal(root, records, true, (key) => key);
    expect(root.querySelector("details")?.open).toBe(true);
    expect(root.querySelectorAll('tbody tr[part~="entry-row"]')).toHaveLength(1);
    renderJournal(root, records, false, (key) => key);
    expect(root.querySelector("details")).toBeNull();
    expect(root.textContent).toContain("0 ms");
});

function fixture(): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = `<section part="filters"><input name="event"><input name="service"><input name="request"><select name="level"><option value=""></option></select><div cms-bloc="ulvia--mossa--date-range"></div><input type="checkbox" data-grouped checked><button data-search></button></section><p data-status></p><p data-error hidden></p><button data-next hidden></button><div data-results></div><p data-summary></p>`;
    document.body.append(root);
    return root;
}

test("pagination keeps applied filters, makes one bounded query and releases on unmount", async () => {
    const requests: { input: Record<string, unknown>; signal: AbortSignal }[] = [];
    globalThis.fetch = (async (_url, init) => {
        requests.push({ input: JSON.parse(String(init?.body)), signal: init?.signal as AbortSignal });
        return Response.json({
            items: [entry("a", 0, "r")],
            from: "2026-11-06T10:00Z",
            to: "2026-11-06T11:00Z",
            nextCursor: requests.length === 1 ? "next" : null,
        });
    }) as typeof fetch;
    window.history.replaceState(null, "", "/?ulvia--mossa--log-service=provider");
    const root = fixture();
    cleanup = mount(root);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toMatchObject({ service: "provider", limit: 50 });
    root.querySelector("summary")?.click();
    root.querySelector<HTMLInputElement>("[data-grouped]")?.click();
    expect(requests).toHaveLength(1);
    const service = root.querySelector<HTMLInputElement>('[name="service"]');
    if (service) {
        service.value = "unapplied-draft";
    }
    root.querySelector<HTMLButtonElement>("[data-next]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.input).toMatchObject({ service: "provider", cursor: "next", limit: 50 });
    expect(requests[1]?.input.from).toBe(requests[0]?.input.from);
    expect(root.querySelector<HTMLElement>("[data-next]")?.hidden).toBe(true);
    cleanup?.();
    cleanup = undefined;
    expect(requests[1]?.signal.aborted).toBe(true);
});

test("superseded requests cannot replace the current result and failures expose no raw payload", async () => {
    let first: ((value: Response) => void) | undefined;
    let count = 0;
    globalThis.fetch = (async () => {
        count++;
        if (count === 1) {
            return await new Promise<Response>((resolve) => {
                first = resolve;
            });
        }
        return Response.json({ items: [entry("new", 20, "new-request")], from: "from", to: "to", nextCursor: null });
    }) as typeof fetch;
    const root = fixture();
    cleanup = mount(root);
    root.querySelector<HTMLButtonElement>("[data-search]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    first?.(Response.json({ items: [entry("old", 1, "old-request")], nextCursor: null }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.textContent).toContain("new-request");
    expect(root.textContent).not.toContain("old-request");
    globalThis.fetch = (async () => Response.json({ secret: "private diagnostic" }, { status: 403 })) as typeof fetch;
    root.querySelector<HTMLButtonElement>("[data-search]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector<HTMLElement>("[data-error]")?.hidden).toBe(false);
    expect(root.textContent).not.toContain("private diagnostic");
});
