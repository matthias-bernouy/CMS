import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — boundaries", () => {
    test("binds a nested source's own attributes but does not descend into its subtree", () => {
        const { host, region } = mount(
            `
            <div>
                <div cms-source="/api/{{ id }}" data-id="{{ id }}">
                    <span>{{ id }}</span>
                </div>
            </div>
        `,
            { id: 7 },
        );
        const source = host.querySelector("[cms-source]")!;

        expect(source.getAttribute("cms-source")).toBe("/api/7");
        expect(source.getAttribute("data-id")).toBe("7");
        expect(text(source.querySelector("span"))).toBe("{{ id }}");

        region.update({ value: { id: 8 } });
        expect(source.getAttribute("cms-source")).toBe("/api/8");
        expect(source.getAttribute("data-id")).toBe("8");
        expect(text(source.querySelector("span"))).toBe("{{ id }}");
    });

    test("descends into submit sources for parent data while keeping submit result bindings inert", () => {
        const { host, region } = mount(
            `
            <form cms-source="/api/save as result" cms-source-trigger="submit" data-id="{{ id }}" cms-source-success-redirect="/saved?id={{ result.body.id }}">
                <input name="site.name" value="{{ site.name }}">
                <select name="site.notFound">
                    <option cms-repeat="pages" value="{{ path }}">{{ title }}</option>
                </select>
                <input class="enabled" cms-condition="email.enabled" name="email.enabled" value="true">
                <input class="disabled" cms-condition="!email.enabled" name="email.enabled" value="true">
                <p class="success" cms-condition="result.ok">Saved {{ result.body.id }}</p>
            </form>
        `,
            {
                id: "settings",
                site: { name: "Demo" },
                email: { enabled: true },
                pages: [{ path: "/404", title: "Not found" }],
            },
        );
        const form = host.querySelector("form")!;

        expect(form.getAttribute("data-id")).toBe("settings");
        expect(form.getAttribute("cms-source-success-redirect")).toBe("/saved?id={{ result.body.id }}");
        expect(form.querySelector("input")!.getAttribute("value")).toBe("Demo");
        expect(form.querySelector("option")!.getAttribute("value")).toBe("/404");
        expect(text(form.querySelector("option"))).toBe("Not found");
        expect(form.querySelector(".enabled")).not.toBeNull();
        expect(form.querySelector(".enabled")!.hasAttribute("cms-condition")).toBe(false);
        expect(form.querySelector(".disabled")).toBeNull();
        expect(text(form.querySelector(".success"))).toBe("Saved {{ result.body.id }}");
        expect(form.querySelector(".success")!.hasAttribute("cms-condition")).toBe(true);

        region.update({
            value: {
                id: "settings-2",
                site: { name: "Updated" },
                email: { enabled: false },
                pages: [{ path: "/500", title: "Server error" }],
            },
        });

        expect(form.getAttribute("data-id")).toBe("settings-2");
        expect(form.getAttribute("cms-source-success-redirect")).toBe("/saved?id={{ result.body.id }}");
        expect(form.querySelector("input")!.getAttribute("value")).toBe("Updated");
        expect(form.querySelector("option")!.getAttribute("value")).toBe("/500");
        expect(text(form.querySelector("option"))).toBe("Server error");
        expect(form.querySelector(".enabled")).toBeNull();
        expect(form.querySelector(".disabled")).not.toBeNull();
        expect(form.querySelector(".disabled")!.hasAttribute("cms-condition")).toBe(false);
        expect(text(form.querySelector(".success"))).toBe("Saved {{ result.body.id }}");
    });

    test("binds a nested binding core's own attributes but keeps its subtree inert", () => {
        const { host } = mount(
            `
            <section>
                <cms-binding-core data-id="{{ id }}">
                    <span>{{ id }}</span>
                </cms-binding-core>
            </section>
        `,
            { id: "outer" },
        );
        const core = host.querySelector("cms-binding-core")!;

        expect(core.getAttribute("data-id")).toBe("outer");
        expect(text(core.querySelector("span"))).toBe("{{ id }}");
    });
});
