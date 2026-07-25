import { afterEach, describe, expect, test } from "bun:test";
import {
    prepareNetworkInertBindings,
    readNetworkBindingAttribute,
    restoreNetworkBindingMarkup,
    writeNetworkBindingAttribute,
} from "../../../src/binding/core/networkBindings";
import { CompiledTemplate } from "../../../src/binding/reactive/CompiledTemplate";
import { resetDom } from "../testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("network-inert image bindings", () => {
    test("binds src and srcset without exposing network attributes", () => {
        const { compiled, host, region } = mount(
            `<img src="/media/{{ id }}" srcset="/media/{{ id }}-2x 2x"
                sizes="{{ sizes }}" width="{{ width }}" height="300" alt="{{ label }}">`,
            { id: "one", label: "One", sizes: "50vw", width: 400 },
        );
        const image = host.querySelector("img")!;

        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("srcset")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toBe("/media/one");
        expect(image.getAttribute("data-cms-srcset")).toBe("/media/one-2x 2x");
        expect(image.getAttribute("data-cms-sizes")).toBe("50vw");
        expect(image.getAttribute("data-cms-width")).toBe("400");
        expect(image.getAttribute("data-cms-height")).toBe("300");
        region.update({ value: { id: "two", label: "Two", sizes: "100vw", width: 800 } });
        expect(image.getAttribute("data-cms-src")).toBe("/media/two");

        const raw = compiled.cloneRaw().querySelector("img")!;
        expect(raw.getAttribute("src")).toBe("/media/{{ id }}");
        expect(raw.getAttribute("srcset")).toBe("/media/{{ id }}-2x 2x");
        expect(raw.hasAttribute("data-cms-src")).toBe(false);
    });

    test("keeps a static image active", () => {
        const { host } = mount(`<img src="/logo.svg" srcset="/logo-2x.svg 2x">`, {});
        const image = host.querySelector("img")!;

        expect(image.getAttribute("src")).toBe("/logo.svg");
        expect(image.getAttribute("srcset")).toBe("/logo-2x.svg 2x");
        expect(image.hasAttribute("data-cms-src")).toBe(false);
    });

    test("keeps an authored empty src network-inert without losing it", () => {
        const { compiled, host } = mount(`<img src="" alt="">`, {});
        const image = host.querySelector("img")!;

        expect(image.hasAttribute("src")).toBe(false);
        expect(image.getAttribute("data-cms-src")).toBe("");
        expect(compiled.cloneRaw().querySelector("img")!.getAttribute("src")).toBe("");
    });

    test("makes the complete picture group inert when one candidate is dynamic", () => {
        const template = document.createElement("template");
        template.innerHTML = `<picture>
            <source media="{{ breakpoint }}" srcset="/wide.webp">
            <source srcset="/fallback.webp">
            <img src="/fallback.jpg">
        </picture>`;
        prepareNetworkInertBindings(template.content);
        const [dynamic, fallback] = Array.from(template.content.querySelectorAll("source"));
        const image = template.content.querySelector("img")!;

        expect(dynamic!.getAttribute("data-cms-media")).toBe("{{ breakpoint }}");
        expect(dynamic!.getAttribute("data-cms-srcset")).toBe("/wide.webp");
        expect(fallback!.getAttribute("data-cms-srcset")).toBe("/fallback.webp");
        expect(image.getAttribute("data-cms-src")).toBe("/fallback.jpg");
        expect(template.content.querySelector("[src],[srcset]")).toBeNull();
    });

    test("recurses through inert template contents and restores authored markup", () => {
        const outer = document.createElement("template");
        outer.innerHTML = `<template><picture><source srcset="{{ set }}"><img src="/fallback.jpg"></picture></template>`;
        prepareNetworkInertBindings(outer.content);
        const inner = outer.content.querySelector("template")!;
        expect(inner.content.querySelector("source")!.hasAttribute("srcset")).toBe(false);
        expect(inner.content.querySelector("img")!.hasAttribute("src")).toBe(false);

        restoreNetworkBindingMarkup(outer.content);
        expect(inner.content.querySelector("source")!.getAttribute("srcset")).toBe("{{ set }}");
        expect(inner.content.querySelector("img")!.getAttribute("src")).toBe("/fallback.jpg");
    });

    test("preserves inert bindings through repeats and conditions", () => {
        const { host } = mount(`<img cms-repeat="items as item" cms-condition="item.visible" src="{{ item.url }}">`, {
            items: [
                { visible: true, url: "/one" },
                { visible: false, url: "/two" },
            ],
        });
        const image = host.querySelector("img")!;

        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toBe("/one");
    });

    test("neutralizes in-place children before resolving them", () => {
        const parent = document.createElement("section");
        parent.innerHTML = `<img src="{{ image.url }}" srcset="/fallback 1x">`;
        document.body.append(parent);

        CompiledTemplate.bindChildrenInPlace(parent, { value: { image: { url: "/resolved" } } });
        const image = parent.querySelector("img")!;
        expect(image.hasAttribute("src")).toBe(false);
        expect(image.hasAttribute("srcset")).toBe(false);
        expect(image.getAttribute("data-cms-src")).toBe("/resolved");
        expect(image.getAttribute("data-cms-srcset")).toBe("/fallback 1x");
    });

    test("reads and writes authored values without exposing a dynamic URL", () => {
        const image = document.createElement("img");
        writeNetworkBindingAttribute(image, "src", "{{ image.url }}");
        expect(readNetworkBindingAttribute(image, "src")).toBe("{{ image.url }}");
        expect(image.hasAttribute("src")).toBe(false);

        writeNetworkBindingAttribute(image, "src", "/static.jpg");
        expect(image.getAttribute("data-cms-src")).toBe("/static.jpg");
        restoreNetworkBindingMarkup(image);
        expect(image.getAttribute("src")).toBe("/static.jpg");
        expect(image.hasAttribute("data-cms-src")).toBe(false);

        writeNetworkBindingAttribute(image, "src", null);
        expect(readNetworkBindingAttribute(image, "src")).toBeNull();

        const picture = document.createElement("picture");
        picture.innerHTML = `<source srcset="/wide.webp"><img src="/fallback.jpg">`;
        const source = picture.querySelector("source")!;
        writeNetworkBindingAttribute(source, "media", "{{ breakpoint }}");
        expect(source.getAttribute("data-cms-media")).toBe("{{ breakpoint }}");
        expect(picture.querySelector("img")!.getAttribute("data-cms-src")).toBe("/fallback.jpg");
        expect(picture.querySelector("[src],[srcset]")).toBeNull();

        const nonImage = document.createElement("section");
        writeNetworkBindingAttribute(nonImage, "width", "{{ layout.width }}");
        expect(nonImage.getAttribute("width")).toBe("{{ layout.width }}");
        expect(nonImage.hasAttribute("data-cms-width")).toBe(false);
    });

    test("restores authored dimensions and removes generated attributes", () => {
        const template = document.createElement("template");
        template.innerHTML = `<img src="{{ image.url }}" width="640">`;
        prepareNetworkInertBindings(template.content);
        const image = template.content.querySelector("img")!;
        image.setAttribute("src", "/resolved.jpg");
        image.setAttribute("srcset", "/resolved-640.webp 640w");
        image.setAttribute("sizes", "auto, 100vw");
        image.setAttribute("height", "480");

        expect(readNetworkBindingAttribute(image, "height")).toBeNull();
        restoreNetworkBindingMarkup(template.content);
        expect(image.getAttribute("src")).toBe("{{ image.url }}");
        expect(image.getAttribute("width")).toBe("640");
        expect(image.hasAttribute("srcset")).toBe(false);
        expect(image.hasAttribute("sizes")).toBe(false);
        expect(image.hasAttribute("height")).toBe(false);
        expect(image.hasAttribute("data-cms-network-inert")).toBe(false);
    });

    test("protects pending raw HTML while leaving resolved URLs active", () => {
        const pending = mount(`<div>{{ html | innerHTML }}</div>`, {
            html: `<img src="{{ pending }}">`,
        }).host.querySelector("img")!;
        const resolved = mount(`<div>{{ html | innerHTML }}</div>`, {
            html: `<img src="/resolved.jpg">`,
        }).host.querySelector("img")!;

        expect(pending.hasAttribute("src")).toBe(false);
        expect(pending.getAttribute("data-cms-src")).toBe("{{ pending }}");
        expect(resolved.getAttribute("src")).toBe("/resolved.jpg");
        expect(resolved.hasAttribute("data-cms-src")).toBe(false);
    });
});
