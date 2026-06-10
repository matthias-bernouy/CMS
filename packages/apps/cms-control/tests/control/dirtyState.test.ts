import { describe, test, expect, afterEach } from "bun:test";
import { armDirty, isDirty, clearDirty } from "cms-control/core/editorSystem/dirtyState";

let disarm: (() => void) | null = null;
afterEach(() => { disarm?.(); disarm = null; document.body.replaceChildren(); });

describe("dirtyState (snapshot model)", () => {
    test("starts clean and stays clean until the first interaction", () => {
        const host = document.createElement("div");
        host.innerHTML = `<div cms-bind-stop>a</div>`;
        document.body.appendChild(host);
        const region = host.querySelector("[cms-bind-stop]") as HTMLElement;
        disarm = armDirty(host, () => region.innerHTML);

        expect(isDirty()).toBe(false);
        region.textContent = "changed by a component before any gesture";
        expect(isDirty()).toBe(false); // no baseline yet → never dirty
    });

    test("first interaction freezes the baseline; a later change is dirty", () => {
        const host = document.createElement("div");
        host.innerHTML = `<div cms-bind-stop>a</div>`;
        document.body.appendChild(host);
        const region = host.querySelector("[cms-bind-stop]") as HTMLElement;
        disarm = armDirty(host, () => region.innerHTML);

        host.dispatchEvent(new Event("keydown", { bubbles: true }));
        expect(isDirty()).toBe(false);
        region.textContent = "b";
        expect(isDirty()).toBe(true);
        clearDirty();
        expect(isDirty()).toBe(false);
    });
});
