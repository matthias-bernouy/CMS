import { describe, expect, test } from "bun:test";
import {
    findRangeWrapper,
    unwrapElement,
    wrapRangeContents,
} from "../../src/components/Controls/RichText/RichTextEditor/richTextRangeDom";

function textNode(element: Element): Text {
    return element.firstChild as Text;
}

describe("rich text range DOM helpers", () => {
    test("wraps selected contents and returns a range over the wrapper", () => {
        const editor = document.createElement("div");
        editor.innerHTML = "<p>Hello world</p>";
        const paragraph = editor.querySelector("p")!;
        const range = document.createRange();
        range.setStart(textNode(paragraph), 0);
        range.setEnd(textNode(paragraph), 5);

        const wrappedRange = wrapRangeContents(range, "strong", { "data-tone": "accent" });

        expect(editor.innerHTML).toBe('<p><strong data-tone="accent">Hello</strong> world</p>');
        expect(wrappedRange.toString()).toBe("Hello");
    });

    test("finds only a common matching wrapper inside the editor", () => {
        const editor = document.createElement("div");
        editor.innerHTML = '<a href="/one">One</a><a href="/two">Two</a><span>Plain</span>';
        const links = editor.querySelectorAll<HTMLAnchorElement>("a");
        const sameLinkRange = document.createRange();
        sameLinkRange.setStart(textNode(links[0]!), 0);
        sameLinkRange.setEnd(textNode(links[0]!), 2);

        expect(findRangeWrapper(editor, sameLinkRange, "a", (link) => link.getAttribute("href") === "/one")).toBe(
            links[0],
        );

        const splitRange = document.createRange();
        splitRange.setStart(textNode(links[0]!), 0);
        splitRange.setEnd(textNode(links[1]!), 2);
        expect(findRangeWrapper(editor, splitRange, "a", () => true)).toBeNull();

        const plainRange = document.createRange();
        plainRange.selectNodeContents(editor.querySelector("span")!);
        expect(findRangeWrapper(editor, plainRange, "a", () => true)).toBeNull();
    });

    test("unwraps a populated element and selects its former contents", () => {
        const editor = document.createElement("div");
        editor.innerHTML = "Before<strong>Bold<em> text</em></strong>After";
        const strong = editor.querySelector("strong")!;

        const range = unwrapElement(editor, strong);

        expect(editor.innerHTML).toBe("BeforeBold<em> text</em>After");
        expect(range.toString()).toBe("Bold text");
    });

    test("collapses at the end of the editor when unwrapping an empty element", () => {
        const editor = document.createElement("div");
        editor.innerHTML = "Text<strong></strong>";

        const range = unwrapElement(editor, editor.querySelector("strong")!);

        expect(editor.innerHTML).toBe("Text");
        expect(range.collapsed).toBe(true);
        expect(range.startContainer).toBe(editor);
        expect(range.startOffset).toBe(editor.childNodes.length);
    });
});
