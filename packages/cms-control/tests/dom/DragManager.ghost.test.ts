import { describe, test, expect, beforeEach } from "bun:test";
import { DragManager } from "src/control/components/editor/EditorSystem/DragManager";

function drag(kind: string, target: HTMLElement, captured: any) {
    const ev = new Event(kind, { bubbles: true, cancelable: true }) as any;
    ev.clientY = 0;
    ev.dataTransfer = {
        setData: () => {},
        getData: () => "",
        setDragImage: (img: HTMLElement, x: number, y: number) => {
            captured.image = img;
            captured.x = x;
            captured.y = y;
        },
    };
    target.dispatchEvent(ev);
    return ev;
}

describe("DragManager — drag pill", () => {
    let container: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = "";
        container = document.createElement("div");
        document.body.appendChild(container);
        new DragManager(container);
    });

    test("dragstart registers a fixed 180x32 pill regardless of source size", () => {
        const block = document.createElement("my-hero");
        block.className = "editor-block";
        block.innerHTML = "<h1>Hero</h1>";
        (block as any).getBoundingClientRect = () => ({
            top: 0, bottom: 1200, left: 0, right: 3000, width: 3000, height: 1200,
            x: 0, y: 0, toJSON: () => ({}),
        });
        container.appendChild(block);

        const captured: any = {};
        drag("dragstart", block, captured);

        expect(captured.image).toBeInstanceOf(HTMLElement);
        expect(captured.image.style.width).toBe("180px");
        expect(captured.image.style.height).toBe("32px");
        expect(captured.image.querySelector("span")?.textContent).toBe("<my-hero>");
        expect(captured.image.querySelector("svg")).not.toBeNull();
    });

    test("dragend removes the pill from the DOM", () => {
        const block = document.createElement("div");
        block.className = "editor-block";
        container.appendChild(block);

        drag("dragstart", block, {});
        expect(document.querySelector(".p9r-drag-ghost")).not.toBeNull();

        drag("dragend", block, {});
        expect(document.querySelector(".p9r-drag-ghost")).toBeNull();
    });
});
