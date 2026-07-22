import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — raw HTML", () => {
    test("replaces the placeholder element with parsed HTML on each update", () => {
        const { host, region } = mount(`<div class="html"><raw-html>{{ html | innerHTML }}</raw-html></div>`, {
            html: "<b>First</b>",
        });
        expect(host.querySelector("raw-html")).toBeNull();
        expect(text(host.querySelector("b"))).toBe("First");
        region.update({ value: { html: "<i>Second</i>" } });
        expect(host.querySelector("b")).toBeNull();
        expect(text(host.querySelector("i"))).toBe("Second");
        region.update({ value: { html: "" } });
        expect(host.querySelector("raw-html")).toBeNull();
        expect(host.querySelector(".html")!.children.length).toBe(0);
    });

    test("raw HTML still works when the placeholder is the shown condition root", () => {
        const { host, region } = mount(`<raw-html cms-condition="visible">{{ html | innerHTML }}</raw-html>`, {
            visible: false,
            html: "<b>Hidden</b>",
        });
        expect(host.querySelector("b")).toBeNull();
        region.update({ value: { visible: true, html: "<b>Shown</b>" } });
        expect(host.querySelector("raw-html")).toBeNull();
        expect(text(host.querySelector("b"))).toBe("Shown");
    });
});

describe("CompiledTemplate — structural cloneRaw", () => {
    test("cloneRaw() keeps authored structural directives after live updates", () => {
        const { compiled, region } = mount(
            `<p cms-condition="visible">{{ name }}</p>
             <li cms-repeat="items as item">{{ item.name }}</li>
             <raw-html>{{ html | innerHTML }}</raw-html>`,
            { visible: true, name: "Ada", items: [{ name: "Grace" }], html: "<b>Trusted</b>" },
        );
        region.update({ value: { visible: false, items: [], html: "" } });
        const raw = compiled.cloneRaw();
        expect(raw.querySelector('[cms-condition="visible"]')).not.toBeNull();
        expect(raw.querySelector('[cms-repeat="items as item"]')).not.toBeNull();
        expect(text(raw.querySelector("raw-html"))).toBe("{{ html | innerHTML }}");
        expect(text(raw.querySelector("[cms-condition]"))).toBe("{{ name }}");
    });
});
