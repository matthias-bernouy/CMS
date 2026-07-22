import { afterEach, describe, expect, test } from "bun:test";
import { Source } from "../../../../src/binding/source/Source";
import { el, resetDom, text } from "../../testUtils";
import { jsonSequence } from "./testUtils";

afterEach(resetDom);

describe("Source — parity contract for authored template restore", () => {
    test("renderTemplate() restores structural directives, raw HTML placeholders, and source-state conditions", async () => {
        jsonSequence([{ items: [{ name: "Ada", visible: true }], html: "<b>Trusted</b>" }]);
        const sourceElement = el(`
            <section cms-source="/x">
                <ul>
                    <li cms-repeat="items as item" cms-condition="item.visible">{{ item.name }}</li>
                </ul>
                <raw-html>{{ html | innerHTML }}</raw-html>
                <p cms-condition="$source.empty">No rows</p>
            </section>
        `);
        const source = new Source(sourceElement);

        await source.run();
        expect(sourceElement.querySelector("[cms-repeat]")).toBeNull();
        expect(sourceElement.querySelector("raw-html")).toBeNull();
        expect(text(sourceElement.querySelector("li"))).toBe("Ada");
        expect(text(sourceElement.querySelector("b"))).toBe("Trusted");

        source.renderTemplate();

        const repeated = sourceElement.querySelector("[cms-repeat]")!;
        expect(repeated.getAttribute("cms-repeat")).toBe("items as item");
        expect(repeated.getAttribute("cms-condition")).toBe("item.visible");
        expect(text(repeated)).toBe("{{ item.name }}");
        expect(text(sourceElement.querySelector("raw-html"))).toBe("{{ html | innerHTML }}");
        expect(text(sourceElement.querySelector('[cms-condition="$source.empty"]'))).toBe("No rows");
    });
});

describe("Source — parity contract for body re-renders", () => {
    test("cms-condition can disappear and reappear across source runs", async () => {
        jsonSequence([
            { visible: false, name: "Hidden" },
            { visible: true, name: "Ada" },
            { visible: false, name: "Gone" },
        ]);
        const sourceElement = el(`<div cms-source="/x"><p cms-condition="visible">Hello {{ name }}</p></div>`);
        const source = new Source(sourceElement);

        await source.run();
        expect(sourceElement.querySelector("p")).toBeNull();

        await source.run();
        expect(text(sourceElement.querySelector("p"))).toBe("Hello Ada");

        await source.run();
        expect(sourceElement.querySelector("p")).toBeNull();
    });

    test("raw HTML placeholders are restamped from the pristine body on each run", async () => {
        jsonSequence([{ html: "<b>First</b>" }, { html: "<i>Second</i>" }, { html: "" }]);
        const sourceElement = el(`
            <section cms-source="/x">
                <div class="html"><raw-html>{{ html | innerHTML }}</raw-html></div>
            </section>
        `);
        const source = new Source(sourceElement);

        await source.run();
        expect(sourceElement.querySelector("raw-html")).toBeNull();
        expect(text(sourceElement.querySelector("b"))).toBe("First");

        await source.run();
        expect(sourceElement.querySelector("b")).toBeNull();
        expect(text(sourceElement.querySelector("i"))).toBe("Second");

        await source.run();
        expect(sourceElement.querySelector("raw-html")).toBeNull();
        expect(sourceElement.querySelector(".html")!.children.length).toBe(0);
    });

    test("cms-repeat restamps nested repeats, empty arrays, and non-arrays across runs", async () => {
        jsonSequence([
            {
                groups: [
                    { title: "A", tags: ["x", "y"] },
                    { title: "B", tags: ["z"] },
                ],
            },
            { groups: [{ title: "C", tags: [] }] },
            { groups: [] },
            { groups: "not-an-array" },
        ]);
        const sourceElement = el(`
            <div cms-source="/x">
                <section cms-repeat="groups as group">
                    <h3>{{ group.title }}</h3>
                    <span cms-repeat="group.tags as tag">{{ tag }}</span>
                </section>
            </div>
        `);
        const source = new Source(sourceElement);

        await source.run();
        expect(Array.from(sourceElement.querySelectorAll("h3")).map(text)).toEqual(["A", "B"]);
        expect(Array.from(sourceElement.querySelectorAll("span")).map(text)).toEqual(["x", "y", "z"]);

        await source.run();
        expect(Array.from(sourceElement.querySelectorAll("h3")).map(text)).toEqual(["C"]);
        expect(sourceElement.querySelectorAll("span").length).toBe(0);

        await source.run();
        expect(sourceElement.querySelectorAll("section").length).toBe(0);

        const originalWarn = console.warn;
        const warnings: unknown[][] = [];
        console.warn = (...args: unknown[]) => {
            warnings.push(args);
        };
        try {
            await source.run();
        } finally {
            console.warn = originalWarn;
        }
        expect(sourceElement.querySelectorAll("section").length).toBe(0);
        expect(String(warnings[0]?.[0] ?? "")).toContain('cms-repeat="groups" expected an array');
    });
});
