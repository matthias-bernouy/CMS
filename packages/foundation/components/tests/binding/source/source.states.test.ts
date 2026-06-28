import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { el, text, respond, resetDom } from "../testUtils";

function deferredFetch(status: number, body: string) {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    globalThis.fetch = (async () => { await gate; return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response; }) as unknown as typeof fetch;
    return release;
}

function responseSequence(payloads: { status: number; body: string }[]): void {
    let i = 0;
    globalThis.fetch = (async () => {
        const payload = payloads[Math.min(i, payloads.length - 1)]!;
        i++;
        return { ok: payload.status >= 200 && payload.status < 300, status: payload.status, text: async () => payload.body } as unknown as Response;
    }) as unknown as typeof fetch;
}

afterEach(resetDom);

describe("Source — slot selection", () => {
    test("empty payload → empty slot", async () => {
        respond(200, JSON.stringify([]));
        const src = el(`
            <ul cms-source="/x">
                <li cms-repeat=".">{{ t }}</li>
                <div cms-slot="empty">Nothing here</div>
            </ul>
        `);
        await new Source(src).run();
        expect(src.querySelectorAll("li").length).toBe(0);
        expect(text(src.querySelector("div"))).toBe("Nothing here");
    });

    test("error → error slot bound with status", async () => {
        respond(404, "nope");
        const src = el(`
            <div cms-source="/x">
                <p>{{ name }}</p>
                <div cms-slot="error">Failed: {{ status }}</div>
            </div>
        `);
        await new Source(src).run();
        expect(src.querySelector("p")).toBeNull();
        expect(text(src.querySelector("div"))).toBe("Failed: 404");
    });

    test("error with no error slot → element cleared", async () => {
        respond(500, "");
        const src = el(`<div cms-source="/x"><p>{{ name }}</p></div>`);
        await new Source(src).run();
        expect(src.childNodes.length).toBe(0);
    });

    test("error with no error slot clears a previous reactive body and later success remounts it", async () => {
        responseSequence([
            { status: 200, body: JSON.stringify({ name: "Ada" }) },
            { status: 500, body: "" },
            { status: 200, body: JSON.stringify({ name: "Grace" }) },
        ]);
        const src = el(`<div cms-source="/x"><p>Hello {{ name }}</p><input name="email"></div>`);
        const source = new Source(src);

        await source.run();
        const input = src.querySelector("input")!;
        expect(text(src.querySelector("p"))).toBe("Hello Ada");

        await source.run();
        expect(src.childNodes.length).toBe(0);

        await source.run();
        expect(text(src.querySelector("p"))).toBe("Hello Grace");
        expect(src.querySelector("input")).not.toBe(input);
    });
});

describe("Source — loading state", () => {
    test("loading slot is shown before data arrives, then replaced", async () => {
        const release = deferredFetch(200, JSON.stringify({ name: "Ada" }));
        const src = el(`
            <div cms-source="/x">
                <p class="data">{{ name }}</p>
                <div cms-slot="loading">Loading…</div>
            </div>
        `);
        const p = new Source(src).run();
        expect(text(src.querySelector("div"))).toBe("Loading…"); // synchronous, before fetch resolves
        expect(src.querySelector(".data")).toBeNull();

        release();
        await p;
        expect(text(src.querySelector(".data"))).toBe("Ada");
        expect(src.querySelector("[cms-slot]")).toBeNull();
    });
});

describe("Source — forced state", () => {
    test("a forced missing state slot clears the source without fetching", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ name: "Ada" }) } as unknown as Response;
        }) as unknown as typeof fetch;
        const src = el(`<div cms-source="/x"><p>{{ name }}</p></div>`);

        await new Source(src, {}, { sourceStateForce: "empty" }).run();

        expect(calls).toBe(0);
        expect(src.childNodes.length).toBe(0);
    });
});
