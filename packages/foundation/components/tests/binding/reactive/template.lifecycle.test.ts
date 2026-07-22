import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — raw template and lifecycle", () => {
    test("cloneRaw() returns the authored template after mounted updates", () => {
        const { compiled, region } = mount(`<p>{{ name }}</p>`, { name: "Ada" });

        region.update({ value: { name: "Grace" } });
        const raw = compiled.cloneRaw();

        expect(text(raw.querySelector("p"))).toBe("{{ name }}");
    });

    test("unmount() removes the mounted nodes", () => {
        const { host, region } = mount(`<p>{{ name }}</p><span>Static</span>`, { name: "Ada" });

        expect(host.children.length).toBe(2);
        region.unmount();
        expect(host.childNodes.length).toBe(0);
    });
});
