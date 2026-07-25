import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { BindingCore, BINDING_CORE_TAG, BINDING_DISABLED_ATTR } from "../../../src/binding/bindingCore";
import { text, waitFor, settle, respond, resetDom } from "../testUtils";

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
});
afterEach(resetDom);

describe("<cms-binding-core> — disabled scope", () => {
    test("cms-binding-disabled keeps source content inert and does not fetch", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ name: "Ada" }) } as unknown as Response;
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${BINDING_DISABLED_ATTR}>
                <div cms-source="/x"><p>{{ name }}</p></div>
            </${BINDING_CORE_TAG}>`;

        await settle();
        expect(calls).toBe(0);
        expect(text(document.querySelector("p"))).toBe("{{ name }}");
        expect(document.querySelector("[cms-source]")!.hasAttribute("cms-ready")).toBe(true);
    });

    test("removing cms-binding-disabled starts the runtime", async () => {
        respond(200, JSON.stringify({ name: "Ada" }));
        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${BINDING_DISABLED_ATTR}>
                <div cms-source="/x"><p>{{ name }}</p></div>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector<BindingCore>(BINDING_CORE_TAG)!;

        core.removeAttribute(BINDING_DISABLED_ATTR);

        await waitFor(() => text(document.querySelector("p")) === "Ada");
        expect(text(document.querySelector("p"))).toBe("Ada");
    });

    test("adding cms-binding-disabled aborts an in-flight source request", async () => {
        let signal: AbortSignal | undefined;
        let requestStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            requestStarted = resolve;
        });
        globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
            signal = init?.signal ?? undefined;
            requestStarted();
            return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener(
                    "abort",
                    () => {
                        const error = new Error("Aborted");
                        error.name = "AbortError";
                        reject(error);
                    },
                    { once: true },
                );
            });
        }) as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <div cms-source="/x"><p>{{ name }}</p></div>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector<BindingCore>(BINDING_CORE_TAG)!;
        await started;

        core.setAttribute(BINDING_DISABLED_ATTR, "");
        await settle();

        expect(signal?.aborted).toBe(true);
        expect(core.runtime).toBeNull();
        expect(text(document.querySelector("p"))).toBe("{{ name }}");
    });

    test("cms-binding-disabled keeps nested cores inert", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ name: "Ada" }) } as unknown as Response;
        }) as unknown as typeof fetch;

        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${BINDING_DISABLED_ATTR}>
                <${BINDING_CORE_TAG}>
                    <div cms-source="/x"><p>{{ name }}</p></div>
                </${BINDING_CORE_TAG}>
            </${BINDING_CORE_TAG}>`;

        await settle();
        expect(calls).toBe(0);
        expect(text(document.querySelector("p"))).toBe("{{ name }}");
        expect(document.querySelector("[cms-source]")!.hasAttribute("cms-ready")).toBe(true);
    });
});
