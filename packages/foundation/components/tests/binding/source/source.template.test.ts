import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { el, text, respond, resetDom } from "../testUtils";

afterEach(resetDom);

function commentCount(node: Node): number {
    let count = node.nodeType === Node.COMMENT_NODE ? 1 : 0;
    for (const child of Array.from(node.childNodes)) count += commentCount(child);
    return count;
}

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

    test("renderTemplate() removes reactive anchors after structural body updates", async () => {
        let call = 0;
        globalThis.fetch = (async () => {
            call++;
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    visible: call === 1,
                    items: call === 1 ? [{ name: "Ada" }] : [{ name: "Grace" }, { name: "Lin" }],
                    html: call === 1 ? "<b>First</b>" : "<i>Second</i>",
                }),
            } as unknown as Response;
        }) as unknown as typeof fetch;
        const src = el(`
            <section cms-source="/x">
                <p cms-condition="visible">{{ items.length }}</p>
                <span cms-repeat="items as item">{{ item.name }}</span>
                <raw-html>{{ html | innerHTML }}</raw-html>
                <div cms-slot="empty">Empty</div>
            </section>
        `);
        const source = new Source(src);

        await source.run();
        await source.run();
        expect(commentCount(src)).toBeGreaterThan(0);

        source.renderTemplate();

        expect(commentCount(src)).toBe(0);
        expect(src.querySelector('[cms-condition="visible"]')).not.toBeNull();
        expect(src.querySelector('[cms-repeat="items as item"]')).not.toBeNull();
        expect(text(src.querySelector("raw-html"))).toBe("{{ html | innerHTML }}");
        expect(text(src.querySelector('[cms-slot="empty"]'))).toBe("Empty");
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
