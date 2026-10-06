import { afterEach, expect, test } from "bun:test";
import { Source } from "../../../../../src/browser/binding/source/Source";
import { readSourceData } from "../../../../../src/browser/binding/source/values";
import { el, resetDom, text } from "../../../support/testUtils";
import { deferredJson, jsonSequence } from "../testUtils";
import { mount } from "../../../reactive/compiledTemplateTestUtils";

afterEach(resetDom);

test("equal fresh JSON retains nested repeat nodes, data branches and an edited input", async () => {
    const initial = { groups: [{ title: "A", tags: [{ name: "first" }, { name: "second" }] }], count: 1 };
    jsonSequence([initial]);
    const host = el(`<div cms-source="/x">
        <section cms-condition="$source.loaded">
            <article cms-repeat="groups as group">
                <h3>{{ group.title }}</h3>
                <label cms-repeat="group.tags as tag"><input value="{{ tag.name }}">{{ tag.name }}</label>
            </article>
            <p>{{ count }}</p>
        </section>
    </div>`);
    document.body.append(host);
    const source = new Source(host);
    await source.run();
    const before = readSourceData(host) as typeof initial;
    const nodes = Array.from(host.querySelectorAll("section, article, h3, label, input"));
    const input = host.querySelector("input")!;
    input.value = "Unsaved draft";
    input.focus();
    input.setSelectionRange(1, 4);
    const assertRetained = () => {
        const current = Array.from(host.querySelectorAll("section, article, h3, label, input"));
        expect(current.length).toBe(nodes.length);
        expect(current.every((node, index) => node === nodes[index])).toBe(true);
        expect(input.value).toBe("Unsaved draft");
        expect(document.activeElement === input).toBe(true);
        expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
    };
    const release = deferredJson(initial);
    const pending = source.run();
    assertRetained();
    expect(readSourceData(host) === before).toBe(true);
    release();
    await pending;
    assertRetained();
    expect(readSourceData(host) === before).toBe(true);

    jsonSequence([{ ...initial, count: 2 }]);
    await source.run();
    const after = readSourceData(host) as typeof initial;
    expect(after === before).toBe(false);
    expect(after.groups === before.groups).toBe(true);
    assertRetained();
    expect(text(host.querySelector("p"))).toBe("2");
});

test("changed JSON branches update while unchanged repeated siblings retain their nodes", async () => {
    const initial = {
        items: [
            { name: "Ada", tags: ["a"] },
            { name: "Grace", tags: ["b"] },
        ],
        obsolete: true,
    };
    jsonSequence([
        initial,
        {
            items: [
                { name: "Lin", tags: ["a"] },
                { name: "Grace", tags: ["b"] },
            ],
        },
    ]);
    const host = el(`<div cms-source="/x">
        <article cms-repeat="items as item"><h3>{{ item.name }}</h3><span cms-repeat="item.tags as tag">{{ tag }}</span></article>
    </div>`);
    const source = new Source(host);
    await source.run();
    const before = readSourceData(host) as typeof initial;
    const stable = host.querySelectorAll("article")[1]!;
    const nested = stable.querySelector("span");
    await source.run();
    const after = readSourceData(host) as typeof initial;
    expect(after.items[0] === before.items[0]).toBe(false);
    expect(after.items[0]!.tags === before.items[0]!.tags).toBe(true);
    expect(after.items[1] === before.items[1]).toBe(true);
    expect(Object.hasOwn(after, "obsolete")).toBe(false);
    expect(host.querySelectorAll("article")[1] === stable).toBe(true);
    expect(stable.querySelector("span") === nested).toBe(true);
    expect(Array.from(host.querySelectorAll("h3")).map(text)).toEqual(["Lin", "Grace"]);
});

test("repeat insertion, deletion and reordering update content without retaining moved entries", () => {
    const a = { name: "Ada" };
    const b = { name: "Grace" };
    const c = { name: "Lin" };
    const { host, region } = mount('<article cms-repeat="items as item"><input><p>{{ item.name }}</p></article>', {
        items: [a, b],
    });
    const first = host.querySelector("article")!;
    const originalSecond = host.querySelectorAll("article")[1]!;
    const render = (items: { name: string }[]) => {
        region.update({ value: { items } });
        expect(Array.from(host.querySelectorAll("p")).map(text)).toEqual(items.map((item) => item.name));
    };
    render([a, c, b]);
    expect(host.querySelector("article") === first).toBe(true);
    expect(originalSecond.parentNode).toBeNull();
    const inserted = host.querySelectorAll("article")[1]!;
    render([a, c]);
    expect(host.querySelectorAll("article")[1] === inserted).toBe(true);
    render([c, a]);
    expect(first.parentNode).toBeNull();
    expect(inserted.parentNode).toBeNull();
    render([a]);
    render([]);
    render([b, c]);
    region.unmount();
    expect(host.querySelector("article")).toBeNull();
});
