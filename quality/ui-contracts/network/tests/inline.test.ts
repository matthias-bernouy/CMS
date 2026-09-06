import { describe, expect, test } from "bun:test";
import { inspectNetwork } from "../index";

const inspect = (content: string, browser = true) =>
    inspectNetwork({ path: "components/example/index.html", content, kind: "html", browser });

describe("inline HTML browser network contracts", () => {
    test("keeps original file positions across classic and module scripts", () => {
        const findings = inspect(`<article>Content</article>
<script>
  fetch('/first');
</script>
<script type="module">window.fetch('/second');</script>`);
        expect(findings).toHaveLength(2);
        expect(findings[0]).toMatchObject({ line: 3, column: 3, evidence: "fetch('/first')" });
        expect(findings[1]).toMatchObject({ line: 5, column: 23, evidence: "window.fetch('/second')" });
        expect(findings.every(({ file }) => file === "components/example/index.html")).toBe(true);
    });

    test("ignores external scripts, non-JavaScript types and HTML comments", () => {
        expect(
            inspect(`
            <!-- <script>fetch('/comment')</script> -->
            <script src="/external.js">fetch('/external')</script>
            <script SRC>fetch('/empty-src')</script>
            <script type="application/json">{"example":"fetch('/json')"}</script>
            <script type="application/ld+json">fetch('/data')</script>
            <script type="importmap">fetch('/map')</script>
            <script type="text/plain">fetch('/plain')</script>
            <script language="vbscript">fetch('/other-language')</script>
        `),
        ).toEqual([]);
    });

    test("ignores fake script tags inside quoted attributes, raw text and templates", () => {
        expect(
            inspect(`
            <div data-example="<script>fetch('/attribute')</script>"></div>
            <textarea><script>fetch('/textarea')</script></textarea>
            <style>/* <script>fetch('/style')</script> */</style>
            <noscript><script>fetch('/noscript')</script></noscript>
            <template><template></template><script>fetch('/template')</script></template>
        `),
        ).toEqual([]);
    });

    test("accepts JavaScript MIME types, empty type and legacy JavaScript language", () => {
        expect(
            inspect(`
            <SCRIPT TYPE=' text/javascript '>self.fetch('/mime')</SCRIPT>
            <script type="">fetch('/empty')</script>
            <script language="JavaScript">fetch('/legacy')</script>
        `),
        ).toHaveLength(3);
    });

    test("keeps AST shadowing and string filtering inside executable scripts", () => {
        const findings = inspect(`<script>
            const example = "fetch('/string')";
            function local(fetch) { fetch('/local'); }
            // fetch('/comment');
            const request = window.fetch;
            request('/real');
        </script>`);
        expect(findings).toHaveLength(1);
        expect(findings[0]?.evidence).toBe("request('/real')");
    });

    test("does not inspect server HTML or unclosed script content", () => {
        expect(inspect("<script>fetch('/server')</script>", false)).toEqual([]);
        expect(inspect("<script>fetch('/unfinished')")).toEqual([]);
    });
});
