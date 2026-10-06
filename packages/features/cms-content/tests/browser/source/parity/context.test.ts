import { afterEach, expect, test } from "bun:test";
import { Source } from "../../../../src/browser/binding/source/Source";
import { setSourceData } from "../../../../src/browser/binding/source/values";
import {
    refreshSourceContext,
    setSourceContext,
} from "../../../../src/browser/binding/source/presentation/sourceContext";
import { el, resetDom, res, settle } from "../../support/testUtils";

afterEach(resetDom);

test("local context updates conditions without requesting data or replacing unrelated controls", () => {
    const host = el(
        '<div cms-source="/item as item"><input value="{{ item.name }}"><p cms-condition="editing">Editing {{ item.name }}</p></div>',
    );
    document.body.append(host);
    let editing = false;
    let calls = 0;
    globalThis.fetch = (async () => {
        calls += 1;
        return res(200, "{}");
    }) as unknown as typeof fetch;
    setSourceContext(host, () => ({ editing, item: { name: "Must not override the source" }, $source: {} }));
    setSourceData(host, { name: "Initial" });
    const source = new Source(host);
    source.start();
    const input = host.querySelector("input")!;
    input.value = "Draft";
    input.focus();
    input.setSelectionRange(1, 3);
    editing = true;
    refreshSourceContext(host);
    expect(host.querySelector("p")!.textContent).toBe("Editing Initial");
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("Draft");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    expect(calls).toBe(0);
    source.dispose();
    editing = false;
    refreshSourceContext(host);
    expect(host.querySelector("p")).not.toBeNull();
});

test("updating local context does not cancel a pending source read", async () => {
    const host = el('<div cms-source="/item as item"><p>{{ item.name }} / {{ local }}</p></div>');
    document.body.append(host);
    let release!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
            release = resolve;
        });
    }) as unknown as typeof fetch;
    let local = "Old";
    setSourceContext(host, () => ({ local }));
    const source = new Source(host);
    source.start();
    local = "Current";
    refreshSourceContext(host);
    expect(signal!.aborted).toBe(false);
    release(res(200, '{"name":"Loaded"}'));
    await settle();
    expect(host.querySelector("p")!.textContent).toBe("Loaded / Current");
    source.dispose();
});
