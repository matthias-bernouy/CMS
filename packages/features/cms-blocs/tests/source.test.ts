import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../src/binding/source";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function el(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    return host.firstElementChild as HTMLElement;
}
const text = (e: Element | null) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Resolve every fetch immediately with the given status/body. */
function respond(status: number, body: string) {
    globalThis.fetch = (async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
    })) as unknown as typeof fetch;
}

/** A fetch the test resolves by hand, to observe intermediate (loading) state. */
function deferredFetch(status: number, body: string) {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    globalThis.fetch = (async () => {
        await gate;
        return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    return release;
}

describe("Source — success", () => {
    test("binds the body against the fetched object", async () => {
        respond(200, JSON.stringify({ name: "Ada" }));
        const src = el(`<div cms-source="/x"><p>{{ name }}</p></div>`);
        await new Source(src).run();
        expect(text(src.querySelector("p"))).toBe("Ada");
    });

    test("repeats the body over a fetched array", async () => {
        respond(200, JSON.stringify([{ t: "a" }, { t: "b" }]));
        const src = el(`<ul cms-source="/x"><li cms-repeat=".">{{ t }}</li></ul>`);
        await new Source(src).run();
        expect(Array.from(src.querySelectorAll("li")).map(text)).toEqual(["a", "b"]);
    });
});

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

describe("Source — editor template restore", () => {
    test("renderTemplate() restores the authored body and state slots with cms-slot attrs", async () => {
        respond(200, JSON.stringify({ name: "Ada" }));
        const src = el(`
            <div cms-source="/x">
                <p class="data">{{ name }}</p>
                <div cms-slot="loading">Loading</div>
                <div cms-slot="error">Failed: {{ status }}</div>
                <div cms-slot="empty">Nothing</div>
            </div>
        `);
        const source = new Source(src);

        await source.run();
        expect(text(src.querySelector(".data"))).toBe("Ada");
        expect(src.querySelector("[cms-slot]")).toBeNull();

        source.renderTemplate();

        expect(text(src.querySelector(".data"))).toBe("{{ name }}");
        expect(text(src.querySelector('[cms-slot="loading"]'))).toBe("Loading");
        expect(text(src.querySelector('[cms-slot="error"]'))).toBe("Failed: {{ status }}");
        expect(text(src.querySelector('[cms-slot="empty"]'))).toBe("Nothing");
        expect(Array.from(src.children).map((el) => el.getAttribute("cms-slot") ?? "body"))
            .toEqual(["body", "loading", "error", "empty"]);
    });

    test("renderTemplate() preserves an authored <template> wrapper", async () => {
        respond(200, JSON.stringify({ name: "Ada" }));
        const src = el(`
            <div cms-source="/x">
                <template><my-card>{{ name }}</my-card></template>
                <div cms-slot="empty">Nothing</div>
            </div>
        `);
        const source = new Source(src);

        await source.run();
        expect(text(src.querySelector("my-card"))).toBe("Ada");
        expect(src.querySelector("template")).toBeNull();

        source.renderTemplate();

        const template = src.querySelector("template") as HTMLTemplateElement | null;
        expect(template).not.toBeNull();
        expect(text(template!.content.querySelector("my-card"))).toBe("{{ name }}");
        expect(text(src.querySelector('[cms-slot="empty"]'))).toBe("Nothing");
    });
});

describe("Source — no-op", () => {
    test("empty url → nothing rendered", async () => {
        respond(200, JSON.stringify({ name: "Ada" }));
        const src = el(`<div cms-source="  "><p>{{ name }}</p></div>`);
        await new Source(src).run();
        expect(src.childNodes.length).toBe(0);
    });
});

describe("Source — concurrent runs, last one wins", () => {
    test("a second run supersedes the first; only the latest renders", async () => {
        let call = 0;
        globalThis.fetch = (async () => {
            call++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ n: call }) } as unknown as Response;
        }) as unknown as typeof fetch;

        const src = el(`<div cms-source="/x"><p>{{ n }}</p></div>`);
        const source = new Source(src);
        const p1 = source.run();
        const p2 = source.run();
        await Promise.all([p1, p2]);

        expect(text(src.querySelector("p"))).toBe("2");
    });
});

describe("Source — param-reactive reload guard (URL-changed)", () => {
    test("a global cms-params:change re-runs only when THIS source's resolved URL changed", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ n: calls }) } as unknown as Response;
        }) as unknown as typeof fetch;
        const flush = () => new Promise((r) => setTimeout(r, 0));

        history.replaceState({}, "", "/?a=1");
        const src = el(`<div cms-source="/x?a=#{a}"><p>{{ n }}</p></div>`);
        document.body.appendChild(src);          // isConnected → the param handler runs
        const source = new Source(src);
        source.start();
        await flush();
        expect(calls).toBe(1);                    // initial fetch

        // An UNRELATED param changes (a is unchanged) → same resolved URL → no refetch.
        history.replaceState({}, "", "/?a=1&b=9");
        document.dispatchEvent(new Event("cms-params:change"));
        await flush();
        expect(calls).toBe(1);

        // The referenced param changes → resolved URL differs → refetch.
        history.replaceState({}, "", "/?a=2");
        document.dispatchEvent(new Event("cms-params:change"));
        await flush();
        expect(calls).toBe(2);

        source.dispose();
        src.remove();
        history.replaceState({}, "", "/");
    });
});
