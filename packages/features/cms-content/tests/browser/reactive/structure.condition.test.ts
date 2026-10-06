import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../support/testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — cms-condition", () => {
    test("uses registered predicates to distinguish scalar values from lists without a DOM renderer", () => {
        const { host, region } = mount(
            `<span cms-condition="items | kind == 'scalar'">{{ items }}</span>
             <ul cms-condition="items | kind == 'list'">
               <li cms-repeat="items as item" cms-condition="item | text">{{ item | text }}</li>
             </ul>`,
            { items: "Initial" },
            {
                kind: (value) => (Array.isArray(value) ? "list" : "scalar"),
                text: (value) => String(value ?? "").trim(),
            },
        );
        expect(text(host.querySelector("span"))).toBe("Initial");
        expect(host.querySelector("ul")).toBeNull();
        region.update({ value: { items: [" One ", "", "Two"] } });
        expect(host.querySelector("span")).toBeNull();
        expect(Array.from(host.querySelectorAll("li"), (item) => item.textContent)).toEqual(["One", "Two"]);
        region.update({ value: { items: false } });
        expect(text(host.querySelector("span"))).toBe("false");
        expect(host.querySelector("ul")).toBeNull();
    });
    test("can hide, show, update, hide, and show the same authored branch", () => {
        const { host, region } = mount(`<p cms-condition="visible">Hello {{ name }}</p>`, {
            visible: false,
            name: "Hidden",
        });
        expect(host.querySelector("p")).toBeNull();
        region.update({ value: { visible: true, name: "Ada" } });
        const shown = host.querySelector("p")!;
        expect(text(shown)).toBe("Hello Ada");
        expect(shown.getAttribute("cms-condition")).toBe("visible");
        region.update({ value: { visible: true, name: "Grace" } });
        expect(host.querySelector("p")).toBe(shown);
        expect(text(host.querySelector("p"))).toBe("Hello Grace");
        region.update({ value: { visible: false, name: "Gone" } });
        expect(host.querySelector("p")).toBeNull();
        region.update({ value: { visible: true, name: "Lin" } });
        expect(text(host.querySelector("p"))).toBe("Hello Lin");
    });
});
