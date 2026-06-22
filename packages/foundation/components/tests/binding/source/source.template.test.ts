import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { el, text, respond, resetDom } from "../testUtils";

afterEach(resetDom);

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
