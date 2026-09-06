import { describe, expect, test } from "bun:test";
import { inspectMarkup } from "../index";
import { BINDING_OWNERS } from "../owners";

const component = "packages/surfaces/cms-control/src/components/admin/Example.ts";
const script = (content: string, path = component) => inspectMarkup({ path, content, kind: "script", browser: true });
const html = (content: string, path = component.replace(".ts", ".html")) =>
    inspectMarkup({ path, content, kind: "html", browser: true });

describe("binding document ownership", () => {
    test("reports every explicit document producer with its reason", () => {
        for (const [path, reason] of Object.entries(BINDING_OWNERS)) {
            const findings = path.endsWith(".html")
                ? html("<cms-binding-core></cms-binding-core>", path)
                : script("function shell() { return `<cms-binding-core>${content}</cms-binding-core>`; }", path);
            expect(findings).toHaveLength(1);
            expect(findings[0]).toMatchObject({
                severity: "INFO",
                rule: "binding-core-owner",
                message: reason,
                file: path,
            });
        }
    });

    test("rejects ordinary components even when named preview or shell", () => {
        for (const path of [
            component,
            "packages/surfaces/cms-control/src/components/Preview.ts",
            "packages/surfaces/cms-control/src/components/Shell.ts",
        ]) {
            expect(script('document.createElement("cms-binding-core")', path)[0]?.severity).toBe("ERROR");
        }
    });

    test("ignores comments, raw text, attribute values, selectors and registration", () => {
        expect(
            html(`<!-- <cms-binding-core> -->
            <style>.example::after { content: "<cms-binding-core>" }</style>
            <textarea><cms-binding-core></textarea>
            <script>const example = "<cms-binding-core>";</script>
            <div title="<cms-binding-core>">&lt;cms-binding-core&gt;</div>`),
        ).toEqual([]);
        expect(
            script(`// document.createElement("cms-binding-core")
            /* return '<cms-binding-core>'; */
            const label = "<cms-binding-core>";
            document.querySelector("cms-binding-core");
            customElements.define("cms-binding-core", BindingCore);
            function reference() { return new RegExp("<cms-binding-core\\\\b"); }`),
        ).toEqual([]);
    });

    test("recognizes returned templates, injected constants, imported aliases and DOM factories", () => {
        const findings = script(`import { CMS_BINDING_CORE_TAG as CORE } from "@bernouy/cms-content/editor";
            const template = '<cms-binding-core class="scope"></cms-binding-core>';
            host.innerHTML = template;
            function render() { return \`<\${CORE}>\${content}</\${CORE}>\`; }
            frameDocument.createElement(CORE);
            host.insertAdjacentHTML("beforeend", "<cms-binding-core></cms-binding-core>");`);
        expect(findings).toHaveLength(4);
        expect(findings.every((finding) => finding.severity === "ERROR")).toBe(true);
    });

    test("does not guess dynamic tag values or resolve shadowed imports", () => {
        expect(
            script(`import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
            function example(CMS_BINDING_CORE_TAG) { document.createElement(CMS_BINDING_CORE_TAG); }
            document.createElement(tagFromServer());
            host.innerHTML = \`<\${tag}>content</\${tag}>\`;`),
        ).toEqual([]);
    });

    test("recognizes HTML Response bodies without treating arbitrary constructors as markup sinks", () => {
        const content = `import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
            function preview() {
                return new Response(\`<!doctype html><html><body><\${CMS_BINDING_CORE_TAG} cms-binding-disabled></\${CMS_BINDING_CORE_TAG}></body></html>\`, { headers: { "Content-Type": "text/html" } });
            }`;
        expect(script(content)[0]).toMatchObject({ rule: "binding-core-owner", severity: "ERROR" });
        expect(
            script(content, "packages/surfaces/cms-control/src/core/content/bloc/preview/document.ts")[0],
        ).toMatchObject({
            rule: "binding-core-owner",
            severity: "INFO",
            message: "Produces an autonomous sandboxed bloc preview document with binding disabled.",
        });
        expect(
            script('new Example("<cms-binding-core>"); new Response("ok", { statusText: "<cms-binding-core>" });'),
        ).toEqual([]);
    });

    test("preserves source positions through multiline markup and escaped script literals", () => {
        const direct = html('😀\n  <cms-binding-core title="a > b">');
        expect(direct[0]).toMatchObject({ line: 2, column: 3, evidence: '<cms-binding-core title="a > b">' });
        const escaped = script('const html = "\\n<cms-binding-core>";\nhost.innerHTML = html;');
        expect(escaped[0]).toMatchObject({ line: 1, column: 17 });
        const unicode = script('host.innerHTML = "\\u003ccms-binding-core>";');
        expect(unicode[0]).toMatchObject({ line: 1, column: 19 });
    });

    test("resolves static concatenation without duplicate findings", () => {
        expect(
            script(`const tag = "cms-binding-core";
            const html = "<" + tag + "></" + tag + ">";
            host.innerHTML = html;
            target.innerHTML = html;`),
        ).toHaveLength(1);
    });
});
