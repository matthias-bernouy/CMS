import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — cms-condition", () => {
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
