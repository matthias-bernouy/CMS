import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../support/testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — boundaries", () => {
    test("binds a nested query's ordinary attributes but does not descend into its subtree", () => {
        const { host, region } = mount(
            `
            <div>
                <div cms-query="catalog:item as item" data-id="{{ id }}">
                    <span>{{ id }}</span>
                </div>
            </div>
        `,
            { id: 7 },
        );
        const source = host.querySelector("[cms-query]")!;

        expect(source.getAttribute("cms-query")).toBe("catalog:item as item");
        expect(source.getAttribute("data-id")).toBe("7");
        expect(text(source.querySelector("span"))).toBe("{{ id }}");

        region.update({ value: { id: 8 } });
        expect(source.getAttribute("cms-query")).toBe("catalog:item as item");
        expect(source.getAttribute("data-id")).toBe("8");
        expect(text(source.querySelector("span"))).toBe("{{ id }}");
    });

    test("descends into mutations for parent data while keeping mutation result bindings inert", () => {
        const { host, region } = mount(
            `
            <form cms-mutation="test.settings:save as result" data-id="{{ id }}" cms-mutation-redirect="/saved?id={{ result.data.id }}">
                <input name="site.name" value="{{ site.name }}">
                <select name="site.notFound">
                    <option cms-repeat="pages" value="{{ path }}">{{ title }}</option>
                </select>
                <input class="enabled" cms-condition="email.enabled" name="email.enabled" value="true">
                <input class="disabled" cms-condition="!email.enabled" name="email.enabled" value="true">
                <p class="success" cms-condition="result.outcome.kind === 'success'">Saved {{ result.data.id }}</p>
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
        expect(form.getAttribute("cms-mutation-redirect")).toBe("/saved?id={{ result.data.id }}");
        expect(form.querySelector("input")!.getAttribute("value")).toBe("Demo");
        expect(form.querySelector("option")!.getAttribute("value")).toBe("/404");
        expect(text(form.querySelector("option"))).toBe("Not found");
        expect(form.querySelector(".enabled")).not.toBeNull();
        expect(form.querySelector(".enabled")!.hasAttribute("cms-condition")).toBe(false);
        expect(form.querySelector(".disabled")).toBeNull();
        expect(text(form.querySelector(".success"))).toBe("Saved {{ result.data.id }}");
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
        expect(form.getAttribute("cms-mutation-redirect")).toBe("/saved?id={{ result.data.id }}");
        expect(form.querySelector("input")!.getAttribute("value")).toBe("Updated");
        expect(form.querySelector("option")!.getAttribute("value")).toBe("/500");
        expect(text(form.querySelector("option"))).toBe("Server error");
        expect(form.querySelector(".enabled")).toBeNull();
        expect(form.querySelector(".disabled")).not.toBeNull();
        expect(form.querySelector(".disabled")!.hasAttribute("cms-condition")).toBe(false);
        expect(text(form.querySelector(".success"))).toBe("Saved {{ result.data.id }}");
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

    test("boolean attributes respect nested mutation and result ownership", () => {
        const { host, region } = mount(
            `<form cms-mutation="test.settings:save as result">
                <input required="{{ required }}">
                <button disabled="{{ result.activity === 'submitting' }}">Save</button>
            </form>
            <section cms-query="catalog:nested as nested" hidden="{{ hidden }}">
                <input required="{{ required }}">
            </section>`,
            { required: true, hidden: true, result: { pending: false } },
        );
        expect(host.querySelector("form input")!.hasAttribute("required")).toBe(true);
        expect(host.querySelector("button")!.hasAttribute("disabled")).toBe(true);
        expect(host.querySelector("section")!.hasAttribute("hidden")).toBe(true);
        // This outer renderer does not own the nested query body. Its authored
        // (or SSR-resolved) state remains untouched until that query mounts.
        expect(host.querySelector("section input")!.hasAttribute("required")).toBe(true);
        region.update({ value: { required: false, hidden: false, result: { pending: false } } });
        expect(host.querySelector("form input")!.hasAttribute("required")).toBe(false);
        expect(host.querySelector("button")!.hasAttribute("disabled")).toBe(true);
        expect(host.querySelector("section")!.hasAttribute("hidden")).toBe(false);
    });
});
