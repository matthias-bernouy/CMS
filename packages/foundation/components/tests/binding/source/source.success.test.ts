import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { el, text, respond, resetDom } from "../testUtils";

afterEach(resetDom);

describe("Source — success", () => {
    test("binds the body against the fetched object", async () => {
        respond(200, JSON.stringify({ name: "Ada" }));
        const src = el(`<div cms-source="/x"><p>{{ name }}</p></div>`);
        await new Source(src).run();
        expect(text(src.querySelector("p"))).toBe("Ada");
    });

    test("fetches the URL portion of an aliased source binding", async () => {
        let fetchedUrl = "";
        globalThis.fetch = (async (url: RequestInfo | URL) => {
            fetchedUrl = String(url);
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ name: "Ada" }),
            };
        }) as unknown as typeof fetch;
        const src = el(`<div cms-source="/x?q=#{q} as result"><p>{{ name }}</p></div>`);
        history.replaceState(history.state, "", `${location.pathname}?q=ada${location.hash}`);

        await new Source(src).run();

        expect(fetchedUrl).toBe("/x?q=ada");
        expect(text(src.querySelector("p"))).toBe("Ada");
    });

    test("exposes aliased source data to repeats and interpolation", async () => {
        respond(200, JSON.stringify({ items: [{ name: "Basic" }, { name: "Pro" }] }));
        const src = el(`
            <section cms-source="/plans as plans">
                <h2>{{ plans.items.length }} plans</h2>
                <article cms-repeat="plans.items as plan">{{ plan.name }}</article>
            </section>
        `);

        await new Source(src).run();

        expect(text(src.querySelector("h2"))).toBe("2 plans");
        expect(Array.from(src.querySelectorAll("article")).map(text)).toEqual(["Basic", "Pro"]);
    });

    test("repeats the body over a fetched array", async () => {
        respond(200, JSON.stringify([{ t: "a" }, { t: "b" }]));
        const src = el(`<ul cms-source="/x"><li cms-repeat=".">{{ t }}</li></ul>`);
        await new Source(src).run();
        expect(Array.from(src.querySelectorAll("li")).map(text)).toEqual(["a", "b"]);
    });
});
