import { describe, test, expect, beforeEach } from "bun:test";
import "src/control/components/editor/componentSync/sync/AttrSync";

function nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
}

function resetState() {
    document.body.querySelectorAll("*").forEach((n) => {
        if ((n as HTMLElement).id !== p9r.id.EDITOR_SYSTEM) n.remove();
    });
}

function setupPair(initialAttrs: Record<string, string> = {}) {
    const component = document.createElement("div");
    const identifier = "test-comp-" + Math.random().toString(36).slice(2);
    component.setAttribute(p9r.attr.EDITOR.IDENTIFIER, identifier);
    for (const [k, v] of Object.entries(initialAttrs)) component.setAttribute(k, v);
    document.body.appendChild(component);

    const sync = document.createElement("p9r-attr-sync");
    sync.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, identifier);
    document.body.appendChild(sync);
    return { component, sync };
}

describe("AttrSync — removes attribute when value is cleared", () => {
    beforeEach(() => resetState());

    test("empty string clears the attribute on the component", async () => {
        const { component, sync } = setupPair({ color: "red" });
        const input = document.createElement("input");
        input.setAttribute("name", "color");
        input.value = "red";
        sync.appendChild(input);
        await nextFrame();

        input.value = "";
        input.dispatchEvent(new Event("change", { bubbles: true }));

        expect(component.hasAttribute("color")).toBe(false);
    });

    test("non-empty value still sets the attribute", async () => {
        const { component, sync } = setupPair();
        const input = document.createElement("input");
        input.setAttribute("name", "size");
        sync.appendChild(input);
        await nextFrame();

        input.value = "large";
        input.dispatchEvent(new Event("change", { bubbles: true }));

        expect(component.getAttribute("size")).toBe("large");
    });

    test("clearing then refilling round-trips correctly", async () => {
        const { component, sync } = setupPair({ bg: "blue" });
        const input = document.createElement("input");
        input.setAttribute("name", "bg");
        input.value = "blue";
        sync.appendChild(input);
        await nextFrame();

        input.value = "";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(component.hasAttribute("bg")).toBe(false);

        input.value = "green";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(component.getAttribute("bg")).toBe("green");
    });
});
