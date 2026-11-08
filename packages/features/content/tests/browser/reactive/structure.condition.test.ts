import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../support/testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — cms-condition", () => {
    test("uses registered predicates to distinguish scalar values from lists without a DOM renderer", () => {
        const { host, region } = mount(
            `<span cms-condition="items | kind === 'scalar'">{{ items }}</span>
             <ul cms-condition="items | kind === 'list'">
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

describe("CompiledTemplate — cms-match", () => {
    test("mounts exactly one literal case and updates the active branch", () => {
        const { host, region } = mount(
            `<section cms-match="status">
                <p cms-case="'idle'">Idle</p>
                <p cms-case="'ready'">Ready {{ name }}</p>
                <p cms-case="'failed'">Failed</p>
            </section>`,
            { status: "idle", name: "Initial" },
        );
        expect(text(host.querySelector("p"))).toBe("Idle");
        expect(host.querySelector("[cms-case]")).toBeNull();
        region.update({ value: { status: "ready", name: "Ada" } });
        expect(text(host.querySelector("p"))).toBe("Ready Ada");
        region.update({ value: { status: "unknown", name: "Nobody" } });
        expect(host.querySelector("p")).toBeNull();
    });

    test("supports nested matches with independently narrowed values", () => {
        const { host, region } = mount(
            `<div cms-match="outcome.kind">
                <article cms-case="'success'">{{ data.title }}</article>
                <section cms-case="'error'" cms-match="outcome.code">
                    <p cms-case="'NOT_FOUND'">Missing</p>
                    <p cms-case="'FORBIDDEN'">Forbidden</p>
                </section>
            </div>`,
            { outcome: { kind: "error", code: "NOT_FOUND" }, data: null },
        );
        expect(text(host.querySelector("p"))).toBe("Missing");
        region.update({ value: { outcome: { kind: "error", code: "FORBIDDEN" }, data: null } });
        expect(text(host.querySelector("p"))).toBe("Forbidden");
        region.update({ value: { outcome: { kind: "success" }, data: { title: "Published" } } });
        expect(text(host.querySelector("article"))).toBe("Published");
    });
});
