import { afterEach, describe, expect, test } from "bun:test";
import { Editor } from "@bernouy/cms-content/editor";
import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
} from "@bernouy/components/base";
import { FrameHighlight } from "../../src/components/Layout/Shell/Controller/Core/FrameHighlight";

afterEach(() => {
    document.body.replaceChildren();
    document.getElementById("cms-editor-v2-highlight-style")?.remove();
});

describe("composition frame highlight", () => {
    test("measures the visible generated output instead of the boxless host", () => {
        const host = document.createElement("site-header");
        host.setAttribute(COMPOSITION_RUNTIME_ATTRIBUTE, "");

        const input = document.createElement("template");
        input.setAttribute(COMPOSITION_INPUT_ATTRIBUTE, "");
        const output = document.createElement("p9r-composition-output");
        output.setAttribute(COMPOSITION_OUTPUT_ATTRIBUTE, "");
        const first = document.createElement("div");
        const second = document.createElement("div");
        output.append(first, second);
        host.append(input, output);
        document.body.append(host);

        host.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
        first.getBoundingClientRect = () => new DOMRect(10, 20, 30, 40);
        second.getBoundingClientRect = () => new DOMRect(40, 50, 20, 10);

        const highlight = new FrameHighlight();
        highlight.show(new Editor(host));

        const overlay = document.querySelector<HTMLElement>("[data-cms-editor-v2-highlight]")!;
        expect(overlay.style.left).toBe("10px");
        expect(overlay.style.top).toBe("20px");
        expect(overlay.style.width).toBe("50px");
        expect(overlay.style.height).toBe("40px");

        highlight.dispose();
    });
});
