import { afterEach, expect, test } from "bun:test";
import { BindingRegistry } from "../../../../src/browser/binding/runtime/BindingRegistry";
import { Source } from "../../../../src/browser/binding/source/Source";
import { readSourceData, setSourceData } from "../../../../src/browser/binding/source/values";
import { el, resetDom, res, settle } from "../../support/testUtils";

afterEach(resetDom);

test("source values cannot replace a form-owned submission result", () => {
    for (const trigger of ["submit", "change"]) {
        const host = el(`<form cms-source="/save as result" cms-source-trigger="${trigger}"></form>`);
        expect(() => setSourceData(host, { ok: true })).toThrow("automatic read source");
        expect(readSourceData(host)).toBeUndefined();
    }
});

test("a completed read is remembered without aborting its successful request", async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return res(200, '{"name":"Loaded"}');
    }) as unknown as typeof fetch;
    const host = el('<div cms-source="/item as item"><p>{{ item.name }}</p></div>');
    const source = new Source(host);
    source.start();
    await settle();
    expect(signal!.aborted).toBe(false);
    expect(readSourceData(host)).toEqual({ name: "Loaded" });
    source.dispose();
});

test("a supplied initial source value binds the ordinary template without a request", () => {
    let calls = 0;
    globalThis.fetch = (async () => {
        calls += 1;
        return res(200, "{}");
    }) as unknown as typeof fetch;
    const host = el('<div cms-source="/item as item"><p>{{ item.name }}</p><input value="{{ item.name }}"></div>');
    const value = { name: "Initial" };
    setSourceData(host, value);
    const source = new Source(host);
    document.body.append(host);
    source.start();
    document.dispatchEvent(new Event("cms-params:change"));
    expect(calls).toBe(0);
    expect(host.querySelector("p")!.textContent).toBe("Initial");
    expect(readSourceData(host)).toBe(value);
    const input = host.querySelector("input");
    setSourceData(host, { name: "Saved" });
    expect(host.querySelector("input")).toBe(input);
    expect(input!.value).toBe("Saved");
    source.dispose();
    expect(readSourceData(host)).toBeUndefined();
});

test("null is a supplied value and renders the empty source state", () => {
    const host = el('<div cms-source="/item"><p cms-condition="$source.empty">Empty</p></div>');
    setSourceData(host, null);
    const source = new Source(host);
    source.start();
    expect(host.querySelector("p")!.textContent).toBe("Empty");
    expect(readSourceData(host)).toBeNull();
    source.dispose();
});

test("an action result cancels the older read and a late response cannot replace it", async () => {
    let release!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
            release = resolve;
        });
    }) as unknown as typeof fetch;
    const host = el('<div cms-source="/item as item"><p>{{ item.name }}</p></div>');
    const source = new Source(host);
    source.start();
    setSourceData(host, { name: "Saved" });
    expect(signal!.aborted).toBe(true);
    release(res(200, '{"name":"Stale"}'));
    await settle();
    expect(host.querySelector("p")!.textContent).toBe("Saved");
    expect(readSourceData(host)).toEqual({ name: "Saved" });
    source.dispose();
});

test("unchanged bound attributes do not retrigger a custom input and erase its draft", () => {
    const tag = "test-source-draft-input";
    customElements.define(
        tag,
        class extends HTMLElement {
            value = "";
            static observedAttributes = ["value"];
            attributeChangedCallback(_name: string, _old: string, value: string): void {
                this.value = value;
            }
        },
    );
    const host = el(
        `<div cms-source="/item as item"><${tag} value="{{ item.name }}"></${tag}><p>{{ item.status }}</p></div>`,
    );
    setSourceData(host, { name: "Initial", status: "old" });
    const source = new Source(host);
    source.start();
    const control = host.querySelector(tag) as HTMLElement & { value: string };
    control.value = "Unsaved draft";
    setSourceData(host, { name: "Initial", status: "new" });
    expect(control.value).toBe("Unsaved draft");
    expect(host.querySelector("p")!.textContent).toBe("new");
    source.dispose();
});

test("explicitly seeded URL-less sources bind locally and can transition to network data", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
        calls += 1;
        return res(200, '{"name":"Network"}');
    }) as unknown as typeof fetch;
    const root = el('<main><div cms-source=""><p>{{ name }}</p></div><div cms-source=""><p>Unseeded</p></div></main>');
    const host = root.firstElementChild!;
    setSourceData(host, { name: "Local" });
    document.body.append(root);
    const registry = new BindingRegistry(root, {}, {}, () => {});
    registry.registerSource(host);
    registry.registerSource(root.lastElementChild!);
    expect(host.textContent).toBe("Local");
    expect(registry.sourceCount).toBe(1);
    expect(calls).toBe(0);
    setSourceData(host, { name: "Updated" });
    expect(host.textContent).toBe("Updated");
    host.setAttribute("cms-source", "/network");
    registry.reconcileSource(host);
    await settle();
    expect(calls).toBe(1);
    expect(host.textContent).toBe("Network");
    host.setAttribute("cms-source", "");
    registry.reconcileSource(host);
    await settle();
    expect(registry.sourceCount).toBe(0);
    expect(readSourceData(host)).toBeUndefined();
    registry.teardown();
});
