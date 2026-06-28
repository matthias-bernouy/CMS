import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { BindingCore, BINDING_CORE_TAG, SOURCE_STATE_FORCE_ATTR } from "../../../src/binding/bindingCore";
import { text, waitFor, settle, respond, resetDom } from "../testUtils";

beforeAll(() => { if (!customElements.get(BINDING_CORE_TAG)) customElements.define(BINDING_CORE_TAG, BindingCore); });
afterEach(resetDom);

function commentCount(node: Node): number {
    let count = node.nodeType === Node.COMMENT_NODE ? 1 : 0;
    for (const child of Array.from(node.childNodes)) count += commentCount(child);
    return count;
}

describe("<cms-binding-core> — forced source state", () => {
    test("cms-source-state-force=loading renders loading slots without fetching", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ name: "Ada" }) } as unknown as Response;
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${SOURCE_STATE_FORCE_ATTR}="loading">
                <div cms-source="/x">
                    <p>{{ name }}</p>
                    <div cms-slot="loading">Loading</div>
                </div>
            </${BINDING_CORE_TAG}>`;

        await settle();
        expect(calls).toBe(0);
        expect(text(document.querySelector("[cms-source] > div"))).toBe("Loading");
    });

    test("cms-source-state-force=empty renders empty slots without fetching", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ name: "Ada" }) } as unknown as Response;
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${SOURCE_STATE_FORCE_ATTR}="empty">
                <div cms-source="/x">
                    <p>{{ name }}</p>
                    <div cms-slot="empty">No data</div>
                </div>
            </${BINDING_CORE_TAG}>`;

        await settle();
        expect(calls).toBe(0);
        expect(text(document.querySelector("[cms-source] > div"))).toBe("No data");
    });

    test("cms-source-state-force=error renders error slots with a forced context", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ name: "Ada" }) } as unknown as Response;
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${SOURCE_STATE_FORCE_ATTR}="error">
                <div cms-source="/x">
                    <p>{{ name }}</p>
                    <div cms-slot="error">Failed: {{ message }}</div>
                </div>
            </${BINDING_CORE_TAG}>`;

        await settle();
        expect(calls).toBe(0);
        expect(text(document.querySelector("[cms-source] > div"))).toBe("Failed: Forced error state");
    });

    test("changing forced state re-renders from the authored template", async () => {
        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${SOURCE_STATE_FORCE_ATTR}="loading">
                <div cms-source="/x">
                    <p>{{ name }}</p>
                    <div cms-slot="loading">Loading</div>
                    <div cms-slot="empty">No data</div>
                </div>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector<BindingCore>(BINDING_CORE_TAG)!;

        await waitFor(() => text(document.querySelector("[cms-source] > div")) === "Loading");
        core.setAttribute(SOURCE_STATE_FORCE_ATTR, "empty");

        await waitFor(() => text(document.querySelector("[cms-source] > div")) === "No data");
        expect(text(document.querySelector("[cms-source] > div"))).toBe("No data");
    });

    test("changing from loaded to forced state clears the reactive body region", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ name: "Ada" }) } as unknown as Response;
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <div cms-source="/x">
                    <p>{{ name }}</p>
                    <div cms-slot="empty">No data</div>
                </div>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector<BindingCore>(BINDING_CORE_TAG)!;
        const source = document.querySelector("[cms-source]")!;

        await waitFor(() => text(source.querySelector("p")) === "Ada");
        expect(commentCount(source)).toBeGreaterThan(0);

        core.setAttribute(SOURCE_STATE_FORCE_ATTR, "empty");

        await waitFor(() => text(source.querySelector("div")) === "No data");
        expect(calls).toBe(1);
        expect(source.querySelector("p")).toBeNull();
        expect(commentCount(source)).toBe(0);
    });

    test("a forced parent core does not force nested binding cores", async () => {
        respond(200, JSON.stringify({ name: "Nested" }));
        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${SOURCE_STATE_FORCE_ATTR}="loading">
                <div cms-source="/outer">
                    <div cms-slot="loading">Outer loading</div>
                </div>
                <${BINDING_CORE_TAG}>
                    <div cms-source="/inner">
                        <p>{{ name }}</p>
                        <div cms-slot="loading">Inner loading</div>
                    </div>
                </${BINDING_CORE_TAG}>
            </${BINDING_CORE_TAG}>`;

        await waitFor(() => text(document.querySelector(`${BINDING_CORE_TAG} ${BINDING_CORE_TAG} p`)) === "Nested");
        expect(text(document.querySelector(`${BINDING_CORE_TAG} > [cms-source] > div`))).toBe("Outer loading");
        expect(text(document.querySelector(`${BINDING_CORE_TAG} ${BINDING_CORE_TAG} p`))).toBe("Nested");
    });
});
