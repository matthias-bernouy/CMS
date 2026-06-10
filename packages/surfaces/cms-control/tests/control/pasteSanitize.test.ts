import { describe, test, expect } from "bun:test";
import { sanitizePastedHtml } from "cms-control/components/editor/RichTextBar/sanitizePastedHtml";

describe("sanitizePastedHtml", () => {
    test("keeps inline formatting tags (b/i/u/s)", () => {
        const out = sanitizePastedHtml("<b>bold</b> <i>it</i> <u>un</u> <s>str</s>");
        expect(out).toBe("<b>bold</b> <i>it</i> <u>un</u> <s>str</s>");
    });

    test("maps foreign equivalents to editor-native tags", () => {
        const out = sanitizePastedHtml(
            "<strong>b</strong><em>i</em><strike>s1</strike><del>s2</del><ins>u</ins>",
        );
        expect(out).toBe("<b>b</b><i>i</i><s>s1</s><s>s2</s><u>u</u>");
    });

    test("keeps a safe link with href only, dropping other attributes", () => {
        const out = sanitizePastedHtml(
            `<a href="https://x.com" target="_blank" rel="x" class="c">link</a>`,
        );
        expect(out).toBe(`<a href="https://x.com">link</a>`);
    });

    test("unwraps a link with an unsafe scheme, keeping its text", () => {
        const out = sanitizePastedHtml(`<a href="javascript:alert(1)">click</a>`);
        expect(out.toLowerCase()).not.toContain("javascript:");
        expect(out).not.toContain("<a");
        expect(out).toContain("click");
    });

    test("unwraps <div>, keeping inner formatting and text", () => {
        const out = sanitizePastedHtml("<div><b>bold</b> plain <i>it</i></div>");
        expect(out).not.toContain("<div");
        expect(out).toBe("<b>bold</b> plain <i>it</i>");
    });

    test("keeps headings and lists", () => {
        const out = sanitizePastedHtml("<h2>Title</h2><ul><li>one</li><li>two</li></ul>");
        expect(out).toBe("<h2>Title</h2><ul><li>one</li><li>two</li></ul>");
    });

    test("drops <script>/<style>/<img>/<iframe> with their content", () => {
        const out = sanitizePastedHtml(
            `<p>ok<script>alert(1)</script><style>p{}</style><img src="x"><iframe></iframe></p>`,
        );
        expect(out).toBe("<p>ok</p>");
    });

    test("strips on* handlers, class, id and editor chrome attributes", () => {
        const out = sanitizePastedHtml(
            `<p onclick="x()" class="c" id="i" contenteditable="true" tabindex="0" p9r-x="y">t</p>`,
        );
        expect(out).toBe("<p>t</p>");
    });

    test("keeps font-size and color on span, drops other style props", () => {
        const out = sanitizePastedHtml(
            `<span style="font-size: 24px; color: red; margin: 5px; font-weight: bold;">t</span>`,
        );
        expect(out).toContain("font-size: 24px");
        expect(out).toContain("color: red");
        expect(out).not.toContain("margin");
        expect(out).not.toContain("font-weight");
    });

    test("unwraps a style-less span (Word chrome)", () => {
        const out = sanitizePastedHtml(`<span lang="EN">text</span>`);
        expect(out).toBe("text");
    });

    test("keeps text-align on a block element only", () => {
        const out = sanitizePastedHtml(`<p style="text-align: center; color: red;">c</p>`);
        expect(out).toContain("text-align: center");
        expect(out).not.toContain("color");
    });

    test("rejects an unknown text-align value", () => {
        const out = sanitizePastedHtml(`<p style="text-align: expression(x)">c</p>`);
        expect(out).toBe("<p>c</p>");
    });

    test("strips CSS values carrying url()/expression()", () => {
        const out = sanitizePastedHtml(
            `<span style="color: red; font-size: url(javascript:x)">t</span>`,
        );
        expect(out).toContain("color: red");
        expect(out).not.toContain("url(");
    });

    test("strips Word artifacts (o:p, conditional comments) but keeps prose", () => {
        const out = sanitizePastedHtml(
            `<!--[if gte mso 9]><xml></xml><![endif]--><o:p></o:p><p>Hello <b>world</b></p>`,
        );
        expect(out).toBe("<p>Hello <b>world</b></p>");
    });

    test("preserves <br> line breaks", () => {
        const out = sanitizePastedHtml("line<br>break");
        expect(out).toBe("line<br>break");
    });

    test("unwraps tables, keeping the cell text", () => {
        const out = sanitizePastedHtml("<table><tr><td>a</td><td>b</td></tr></table>");
        expect(out).not.toContain("<table");
        expect(out).not.toContain("<td");
        expect(out).toContain("a");
        expect(out).toContain("b");
    });
});
