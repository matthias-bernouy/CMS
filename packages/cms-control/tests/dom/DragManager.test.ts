import { describe, test, expect, beforeEach } from "bun:test";
import { DragManager } from "src/control/components/editor/EditorSystem/DragManager";

function setRect(el: HTMLElement, top: number, height: number) {
    (el as any).getBoundingClientRect = () => ({
        top, bottom: top + height, left: 0, right: 100, width: 100, height,
        x: 0, y: top, toJSON: () => ({}),
    });
}

function makeBlock(container: HTMLElement, top: number, height = 100) {
    const el = document.createElement("div");
    el.className = "editor-block";
    container.appendChild(el);
    setRect(el, top, height);
    return el;
}

function drag(kind: "dragstart" | "dragover" | "drop" | "dragend", target: HTMLElement, clientY = 0) {
    const ev = new Event(kind, { bubbles: true, cancelable: true }) as any;
    ev.clientY = clientY;
    ev.dataTransfer = {
        setData: () => {},
        getData: () => "",
        setDragImage: () => {},
    };
    target.dispatchEvent(ev);
    return ev;
}

describe("DragManager — indicator-based drag", () => {
    let container: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = "";
        container = document.createElement("div");
        document.body.appendChild(container);
        new DragManager(container);
    });

    test("dragstart marks the block as dragging and hides it from flow (deferred)", async () => {
        const block = makeBlock(container, 0);
        drag("dragstart", block);
        expect(block.classList.contains("dragging")).toBe(true);
        // display:none is applied on the next macrotask — doing it synchronously
        // inside dragstart would abort the native drag operation.
        expect(block.style.display).toBe("");
        await new Promise((r) => setTimeout(r, 0));
        expect(block.style.display).toBe("none");
    });

    test("dragstart on a descendant picks the nearest .editor-block ancestor", () => {
        const block = makeBlock(container, 0);
        const inner = document.createElement("span");
        block.appendChild(inner);
        drag("dragstart", inner);
        expect(block.classList.contains("dragging")).toBe(true);
    });

    test("dragover does NOT reorder the DOM — it only positions the indicator", () => {
        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 100, 100);

        drag("dragstart", a);
        drag("dragover", b, 180);

        // The DOM order is unchanged during dragover; moves happen on drop.
        expect(Array.from(container.children)).toEqual([a, b]);
        const indicator = document.querySelector(".p9r-drop-indicator") as HTMLElement;
        expect(indicator).not.toBeNull();
        expect(indicator.style.opacity).toBe("1");
    });

    test("drop inserts AFTER the target when cursor is below midpoint", () => {
        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 100, 100);

        drag("dragstart", a);
        drag("dragover", b, 180);
        drag("drop", b, 180);

        expect(Array.from(container.children)).toEqual([b, a]);
    });

    test("drop inserts BEFORE the target when cursor is above midpoint", () => {
        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 100, 100);
        const c = makeBlock(container, 200, 100);

        drag("dragstart", c);
        drag("dragover", b, 120);
        drag("drop", b, 120);

        expect(Array.from(container.children)).toEqual([a, c, b]);
    });

    test("dragover over the dragged block itself is ignored (no indicator)", () => {
        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 100, 100);

        drag("dragstart", a);
        drag("dragover", a, 50);

        const indicator = document.querySelector(".p9r-drop-indicator") as HTMLElement;
        expect(indicator.style.opacity).toBe("0");
        // And no commit on drop (no valid target was chosen).
        drag("drop", a, 50);
        expect(Array.from(container.children)).toEqual([a, b]);
    });

    test("dragover over an ancestor of the dragged block is ignored", () => {
        const parent = makeBlock(container, 0, 300);
        const child = makeBlock(parent, 50, 100);
        // Force the lookup: the dragstart event bubbles from `child` — ensure
        // the parent, which contains it, is rejected as a target.
        drag("dragstart", child);
        drag("dragover", parent, 10); // cursor near parent top

        const indicator = document.querySelector(".p9r-drop-indicator") as HTMLElement;
        expect(indicator.style.opacity).toBe("0");
    });

    test("drop restores display and removes the indicator", () => {
        const a = makeBlock(container, 0);
        const b = makeBlock(container, 100);

        a.style.display = "block";
        drag("dragstart", a);
        drag("dragover", b, 180);
        drag("drop", b, 180);

        expect(a.classList.contains("dragging")).toBe(false);
        expect(a.style.display).toBe("block");
        expect(document.querySelector(".p9r-drop-indicator")).toBeNull();
        expect(document.querySelector(".p9r-drag-ghost")).toBeNull();
    });

    test("dragend without a drop restores display and does NOT move the element", () => {
        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 100, 100);

        drag("dragstart", a);
        drag("dragover", b, 180); // would insert after b on drop
        drag("dragend", a);       // but user released outside / escaped

        expect(Array.from(container.children)).toEqual([a, b]);
        expect(a.style.display).toBe("");
        expect(a.classList.contains("dragging")).toBe(false);
    });

    test("indicator width and top mirror the target's bounding box (after)", () => {
        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 100, 100);

        drag("dragstart", a);
        drag("dragover", b, 180); // "after" b → top ≈ bottom(=200) - 1.5

        const indicator = document.querySelector(".p9r-drop-indicator") as HTMLElement;
        expect(indicator.style.width).toBe("100px");
        expect(indicator.style.top).toBe("198.5px");
    });

    test("indicator top mirrors the target's bounding box (before)", () => {
        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 100, 100);

        drag("dragstart", b);
        drag("dragover", a, 20); // "before" a → top ≈ 0 - 1.5

        const indicator = document.querySelector(".p9r-drop-indicator") as HTMLElement;
        expect(indicator.style.top).toBe("-1.5px");
    });

    test("blocks with DISABLE_DRAGGING are rejected as drop targets (e.g. image-sync)", () => {
        const a = makeBlock(container, 0, 100);
        const locked = makeBlock(container, 100, 100);
        locked.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
        const c = makeBlock(container, 200, 100);

        drag("dragstart", a);
        drag("dragover", locked, 140);

        const indicator = document.querySelector(".p9r-drop-indicator") as HTMLElement;
        expect(indicator.style.opacity).toBe("0");

        drag("drop", locked, 140);
        // Nothing moved since no valid target was selected.
        expect(Array.from(container.children)).toEqual([a, locked, c]);
    });

    test("horizontal flow (flex-row parent): indicator is a vertical bar", () => {
        container.style.display = "flex";
        (container as any).style.flexDirection = "row";
        // Force computed style since happy-dom doesn't honour inline style on
        // every property — override getComputedStyle for this test.
        const realGCS = window.getComputedStyle;
        (window as any).getComputedStyle = (el: Element) =>
            el === container
                ? ({ display: "flex", flexDirection: "row" } as any)
                : realGCS.call(window, el);

        const a = makeBlock(container, 0, 100);
        const b = makeBlock(container, 0, 100);
        // Simulate horizontal layout: b at x=[100..200].
        (b as any).getBoundingClientRect = () => ({
            top: 0, bottom: 100, left: 100, right: 200, width: 100, height: 100,
            x: 100, y: 0, toJSON: () => ({}),
        });

        drag("dragstart", a);
        // cursor past midpoint of b → "after" → indicator at b.right
        const ev = new Event("dragover", { bubbles: true, cancelable: true }) as any;
        ev.clientX = 180; ev.clientY = 50;
        ev.dataTransfer = { setData: () => {}, getData: () => "", setDragImage: () => {} };
        b.dispatchEvent(ev);

        const indicator = document.querySelector(".p9r-drop-indicator") as HTMLElement;
        expect(indicator.style.width).toBe("3px");
        expect(indicator.style.height).toBe("100px");
        // "after" → left = b.right - 1.5 = 198.5
        expect(indicator.style.left).toBe("198.5px");

        (window as any).getComputedStyle = realGCS;
    });

    test("slot attribute is matched on drop when target lives in a named slot", () => {
        const inSlot = makeBlock(container, 0, 100);
        inSlot.setAttribute("slot", "body");
        const moving = makeBlock(container, 100, 100);

        drag("dragstart", moving);
        drag("dragover", inSlot, 20);
        drag("drop", inSlot, 20);

        expect(moving.getAttribute("slot")).toBe("body");
    });
});
