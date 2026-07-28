import { describe, expect, test } from "bun:test";
import { renderSafeMarkdown } from "@bernouy/cms-content";
import { parseHTML } from "linkedom";

function renderedDocument(source: string): Document {
    const html = renderSafeMarkdown(source);
    return parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`).document;
}

describe("renderSafeMarkdown", () => {
    test("renders useful Markdown structure", () => {
        const document = renderedDocument(`# Release notes

- Added an endpoint
- Fixed a retry

\`inline()\`

\`\`\`ts
const value = "<safe>";
\`\`\``);

        expect(document.querySelector("h1")?.textContent).toBe("Release notes");
        expect(Array.from(document.querySelectorAll("li"), (item) => item.textContent)).toEqual([
            "Added an endpoint",
            "Fixed a retry",
        ]);
        expect(document.querySelector("p code")?.textContent).toBe("inline()");
        expect(document.querySelector("pre code")?.textContent).toContain('const value = "<safe>";');
        expect(document.querySelector("pre")?.innerHTML).toContain("&lt;safe&gt;");
    });

    test("treats raw HTML as text before DOM sanitization", () => {
        const document = renderedDocument(`<script>alert(1)</script>

<img src="https://example.test/a.png" onerror="alert(2)">

<a href="https://example.test" onclick="alert(3)">raw link</a>`);

        expect(document.querySelector("script")).toBeNull();
        expect(document.querySelector("img")).toBeNull();
        expect(document.querySelector("a")).toBeNull();
        expect(document.body.textContent).toContain("<script>alert(1)</script>");
        expect(document.body.textContent).toContain("onerror");
        expect(document.body.textContent).toContain("onclick");
    });

    test("rejects dangerous link and resource schemes", () => {
        const document = renderedDocument(`[script](javascript:alert(1))
[encoded script](java&#x73;cript:alert(2))
[data](data:text/html;base64,PHNjcmlwdD4=)
[file](file:///etc/passwd)
[unsupported](ftp://example.test/archive)
![inline image](data:image/png;base64,iVBORw0KGgo=)`);

        const urls = Array.from(document.querySelectorAll("a[href], img[src]"), (element) =>
            element.getAttribute(element.tagName === "A" ? "href" : "src"),
        );
        expect(urls).toEqual([]);
        expect(document.querySelector("script")).toBeNull();
    });

    test("preserves safe destinations and hardens external links", () => {
        const document = renderedDocument(`[external](https://example.test/docs)
[protocol relative](//cdn.example.test/docs)
[local](/docs/start)
[fragment](#install)
[email](mailto:team@example.test)
[phone](tel:+33123456789)`);

        const links = Array.from(document.querySelectorAll("a"));
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "https://example.test/docs",
            "//cdn.example.test/docs",
            "/docs/start",
            "#install",
            "mailto:team@example.test",
            "tel:+33123456789",
        ]);
        expect(links[0]?.getAttribute("rel")).toBe("noopener noreferrer");
        expect(links[1]?.getAttribute("rel")).toBe("noopener noreferrer");
        for (const link of links.slice(2)) {
            expect(link.hasAttribute("rel")).toBe(false);
        }
    });
});
