import { describe, test, expect, beforeEach } from "bun:test";
import "cms-control/components/editor/componentSync/sync/StateSync/StateSync";
import type { StateSync } from "cms-control/components/editor/componentSync/sync/StateSync/StateSync";
import type { Component } from "@bernouy/components/base";
import type { Editor } from "cms-control/core/editorSystem/Editor/Editor";

function nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
}

function resetState() {
    document.body.querySelectorAll("*").forEach((n) => {
        if ((n as HTMLElement).id !== p9r.id.EDITOR_SYSTEM) n.remove();
    });
}

/** Minimal Component shape — StateSync only needs `.shadowRoot`. */
function makeFakeComponent(targetClass: string): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const target = document.createElement("div");
    target.classList.add(targetClass);
    shadow.appendChild(target);
    return host;
}

const fakeEditor = {
    registerStateSync:   () => {},
    unregisterStateSync: () => {},
} as unknown as Editor;

function setupSync(attrs: Record<string, string>): { sync: StateSync; target: HTMLElement } {
    const component = makeFakeComponent("target");
    const sync = document.createElement("p9r-state-sync") as StateSync;
    for (const [k, v] of Object.entries(attrs)) sync.setAttribute(k, v);
    document.body.appendChild(sync);
    sync.prepare(component as unknown as Component, fakeEditor);
    return {
        sync,
        target: component.shadowRoot!.querySelector(".target") as HTMLElement,
    };
}

describe("StateSync — single-mode (legacy)", () => {
    beforeEach(resetState);

    test("toggle sets the attribute, second toggle removes it", () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", value: "is-open" });
        expect(target.getAttribute("data-state")).toBeNull();
        sync.toggle();
        expect(target.getAttribute("data-state")).toBe("is-open");
        sync.toggle();
        expect(target.getAttribute("data-state")).toBeNull();
    });

    test("class mode adds and removes a single class token", () => {
        const { sync, target } = setupSync({ target: ".target", attr: "class", value: "is-open" });
        sync.toggle();
        expect(target.classList.contains("is-open")).toBe(true);
        sync.toggle();
        expect(target.classList.contains("is-open")).toBe(false);
    });

    test("isMulti is false; values is [value]", () => {
        const { sync } = setupSync({ target: ".target", attr: "data-state", value: "x" });
        expect(sync.isMulti).toBe(false);
        expect(sync.values).toEqual(["x"]);
    });

    test("isPinned reflects activeValue (backward-compat read)", () => {
        const { sync } = setupSync({ target: ".target", attr: "data-state", value: "x" });
        expect(sync.isPinned).toBe(false);
        sync.toggle();
        expect(sync.isPinned).toBe(true);
        expect(sync.activeValue).toBe("x");
    });
});

describe("StateSync — multi-mode", () => {
    beforeEach(resetState);

    test("isMulti is true when `values=` is set", () => {
        const { sync } = setupSync({ target: ".target", attr: "data-state", values: "loading,error,success" });
        expect(sync.isMulti).toBe(true);
        expect(sync.values).toEqual(["loading", "error", "success"]);
    });

    test("setActiveValue applies the value on the target attribute", () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", values: "loading,error,success" });
        sync.setActiveValue("loading");
        expect(target.getAttribute("data-state")).toBe("loading");
    });

    test("swap between two values clears the previous and sets the new", () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", values: "loading,error,success" });
        sync.setActiveValue("loading");
        sync.setActiveValue("error");
        expect(target.getAttribute("data-state")).toBe("error");
        sync.setActiveValue("success");
        expect(target.getAttribute("data-state")).toBe("success");
    });

    test("setActiveValue(null) unpins (no attribute)", () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", values: "loading,error" });
        sync.setActiveValue("loading");
        sync.setActiveValue(null);
        expect(target.getAttribute("data-state")).toBeNull();
        expect(sync.activeValue).toBeNull();
        expect(sync.isPinned).toBe(false);
    });

    test("rejects a value not in the declared list", () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", values: "loading,error" });
        sync.setActiveValue("nope");
        expect(target.getAttribute("data-state")).toBeNull();
        expect(sync.activeValue).toBeNull();
    });

    test("labels= overrides UI labels (one per value)", () => {
        const { sync } = setupSync({ target: ".target", attr: "data-state", values: "loading,error", labels: "Loading...,Erreur" });
        expect(sync.labels).toEqual(["Loading...", "Erreur"]);
    });

    test("labels defaults to values when the attribute is omitted", () => {
        const { sync } = setupSync({ target: ".target", attr: "data-state", values: "a,b" });
        expect(sync.labels).toEqual(["a", "b"]);
    });

    test("class-mode multi: swap removes the old token and adds the new", () => {
        const { sync, target } = setupSync({ target: ".target", attr: "class", values: "loading,success" });
        sync.setActiveValue("loading");
        expect(target.classList.contains("loading")).toBe(true);
        sync.setActiveValue("success");
        expect(target.classList.contains("loading")).toBe(false);
        expect(target.classList.contains("success")).toBe(true);
    });
});

describe("StateSync — observer reinstates active value", () => {
    beforeEach(resetState);

    test("external removal triggers a re-apply on the next microtask", async () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", values: "loading" });
        sync.setActiveValue("loading");
        target.removeAttribute("data-state");
        await nextFrame();
        expect(target.getAttribute("data-state")).toBe("loading");
    });

    test("rapid self-swaps converge on the final value (no ping-pong)", async () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", values: "a,b,c" });
        sync.setActiveValue("a");
        sync.setActiveValue("b");
        sync.setActiveValue("c");
        await nextFrame();
        expect(target.getAttribute("data-state")).toBe("c");
        expect(sync.activeValue).toBe("c");
    });

    test("after unpin, observer no longer re-applies on external mutations", async () => {
        const { sync, target } = setupSync({ target: ".target", attr: "data-state", values: "loading" });
        sync.setActiveValue("loading");
        sync.setActiveValue(null);
        target.setAttribute("data-state", "external-write");
        await nextFrame();
        expect(target.getAttribute("data-state")).toBe("external-write");
    });
});
