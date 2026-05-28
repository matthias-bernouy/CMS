import { describe, test, expect, beforeEach } from "bun:test";
import { ExtensionRegistry } from "src/control/core/editorSystem/extensions/registry";
import type { RichTextBarExtension } from "src/control/core/editorSystem/extensions/types";

function rtb(name: string): RichTextBarExtension {
    return { label: () => name, getCompletions: () => [], onPick: () => "" };
}

describe("ExtensionRegistry", () => {

    let reg: ExtensionRegistry;
    beforeEach(() => { reg = new ExtensionRegistry(); });

    test("list returns [] for an unknown surface", () => {
        expect(reg.list("richtextbar")).toEqual([]);
    });

    test("add stores the extension and list returns it", () => {
        const ext = rtb("data");
        reg.add("richtextbar", ext);
        expect(reg.list("richtextbar")).toEqual([ext]);
    });

    test("multiple extensions on the same surface coexist (insertion order preserved)", () => {
        const a = rtb("a");
        const b = rtb("b");
        const c = rtb("c");
        reg.add("richtextbar", a);
        reg.add("richtextbar", b);
        reg.add("richtextbar", c);
        expect(reg.list("richtextbar")).toEqual([a, b, c]);
    });

    test("re-adding the same shape does not throw — registry is dedup-free", () => {
        reg.add("richtextbar", rtb("x"));
        expect(() => reg.add("richtextbar", rtb("x"))).not.toThrow();
        expect(reg.list("richtextbar")).toHaveLength(2);
    });

    test("disposer returned by add removes only that extension", () => {
        const a = rtb("a");
        const b = rtb("b");
        const disposeA = reg.add("richtextbar", a);
        reg.add("richtextbar", b);
        expect(reg.list("richtextbar")).toHaveLength(2);
        disposeA();
        expect(reg.list("richtextbar")).toEqual([b]);
    });

    test("calling the disposer twice is a no-op", () => {
        const dispose = reg.add("richtextbar", rtb("z"));
        dispose();
        expect(() => dispose()).not.toThrow();
        expect(reg.list("richtextbar")).toEqual([]);
    });

    test("clear() empties every surface", () => {
        reg.add("richtextbar", rtb("a"));
        reg.add("richtextbar", rtb("b"));
        reg.clear();
        expect(reg.list("richtextbar")).toEqual([]);
    });

    test("clear() is idempotent (no throw on second call)", () => {
        reg.clear();
        expect(() => reg.clear()).not.toThrow();
    });
});
