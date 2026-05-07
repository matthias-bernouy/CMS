import { describe, test, expect, beforeEach } from "bun:test";
import { isDirty, markDirty, clearDirty, onDirtyChange, watchForDirty } from "src/control/core/editorSystem/dirtyState";

describe("dirtyState", () => {
    beforeEach(() => clearDirty());

    test("starts clean", () => {
        expect(isDirty()).toBe(false);
    });

    test("markDirty / clearDirty toggle the flag", () => {
        markDirty();
        expect(isDirty()).toBe(true);
        clearDirty();
        expect(isDirty()).toBe(false);
    });

    test("listeners fire on transitions only", () => {
        const seen: boolean[] = [];
        const off = onDirtyChange(d => seen.push(d));
        markDirty();
        markDirty();         // no-op (already dirty)
        clearDirty();
        clearDirty();        // no-op (already clean)
        off();
        expect(seen).toEqual([true, false]);
    });

    test("watchForDirty fires on a child append", () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const stop = watchForDirty(root);
        root.appendChild(document.createElement("p"));
        // MutationObserver is async — wait a microtask.
        return new Promise<void>(resolve => {
            queueMicrotask(() => {
                expect(isDirty()).toBe(true);
                stop();
                root.remove();
                resolve();
            });
        });
    });
});
