import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { armDirty, isDirty, clearDirty } from "cms-control/core/editorSystem/dirtyState";

/**
 * Snapshot dirty model: dirty = serialized content (here a stand-in
 * `getContent`) diverged from a baseline captured at the user's FIRST
 * interaction. The whole point is that component self-mutation BEFORE the user
 * touches anything is absorbed into the baseline and never reads as an edit.
 */

let disarm: (() => void) | null = null;

// Module-level singleton — start each test (and any prior file) clean.
beforeEach(() => { disarm?.(); disarm = null; });
afterEach(() => { disarm?.(); disarm = null; document.body.replaceChildren(); });

/** Mutable content cell + a host whose first-interaction events arm the baseline. */
function setup(initial = "<p>x</p>") {
    const host = document.createElement("div");
    host.innerHTML = `<div cms-bind-stop>${initial}</div>`;
    document.body.appendChild(host);
    const region = host.querySelector("[cms-bind-stop]") as HTMLElement;
    disarm = armDirty(host, () => region.innerHTML);
    return { host, region };
}

/** Simulate the user's first real interaction (fires before the edit it causes). */
function interact(host: Element) {
    host.dispatchEvent(new Event("pointerdown", { bubbles: true }));
}

describe("armDirty — snapshot dirty", () => {
    test("not dirty before any interaction, even when the canvas mutates on its own", () => {
        const { region } = setup();
        // Component self-mutation at boot (a <w13c-snippet> toggling a class, a
        // bloc reflecting an attribute) — no user gesture yet.
        region.querySelector("p")!.classList.add("hydrated");
        region.appendChild(document.createElement("base-card"));
        expect(isDirty()).toBe(false);
    });

    test("first interaction with no edit → not dirty", () => {
        const { host } = setup();
        interact(host);
        expect(isDirty()).toBe(false);
    });

    test("boot self-mutation is absorbed into the baseline captured at first interaction", () => {
        const { host, region } = setup("<p>x</p>");
        region.querySelector("p")!.setAttribute("align-self", "start"); // bloc reflects its own attr at boot
        interact(host);                                                 // baseline = post-hydration state
        expect(isDirty()).toBe(false);
        region.querySelector("p")!.append(" typed");                    // real user edit
        expect(isDirty()).toBe(true);
    });

    test("edit after first interaction → dirty (text, attribute, structure)", () => {
        const { host, region } = setup("<p>x</p>");
        interact(host);
        region.querySelector("p")!.setAttribute("cms-source", "/api/x"); // panel-written binding attr
        expect(isDirty()).toBe(true);
    });

    test("clearDirty re-baselines (post-save clean; later edit re-dirties)", () => {
        const { host, region } = setup("<p>x</p>");
        interact(host);
        region.querySelector("p")!.append(" edit1");
        expect(isDirty()).toBe(true);
        clearDirty();                                  // save succeeded
        expect(isDirty()).toBe(false);
        region.querySelector("p")!.append(" edit2");
        expect(isDirty()).toBe(true);
    });

    test("disarm stops tracking", () => {
        const { host, region } = setup("<p>x</p>");
        interact(host);
        disarm!();
        disarm = null;
        region.querySelector("p")!.append(" edit");
        expect(isDirty()).toBe(false);
    });
});
