import { describe, expect, test } from "bun:test";
import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    expandCompositions,
} from "@bernouy/cms-content";
import { parseHTML } from "linkedom";

describe("expandCompositions", () => {
    test("projects authored children into server-rendered light DOM", () => {
        const document = body(`<site-layout><main slot="content"><a href="/work">Work</a></main></site-layout>`);

        expandCompositions(document.body, [
            {
                id: "site-layout",
                compositionHTML:
                    '<header><a href="/">Home</a></header><slot name="content"></slot><footer>Legal</footer>',
            },
        ]);

        expect(document.body.innerHTML).toBe(
            '<header><a href="/">Home</a></header><main><a href="/work">Work</a></main><footer>Legal</footer>',
        );
        expect(document.querySelectorAll("a[href]")).toHaveLength(2);
        expect(document.querySelector("site-layout")).toBeNull();
    });

    test("remaps forwarded slots and expands nested compositions", () => {
        const document = body('<outer-shell><a href="/account" slot="navigation">Account</a><p>Body</p></outer-shell>');

        expandCompositions(document.body, [
            {
                id: "outer-shell",
                compositionHTML:
                    '<inner-navigation><slot name="navigation" slot="items"></slot></inner-navigation><slot></slot>',
            },
            {
                id: "inner-navigation",
                compositionHTML: '<nav><slot name="items"></slot></nav>',
            },
        ]);

        expect(document.body.innerHTML).toBe('<nav><a href="/account">Account</a></nav><p>Body</p>');
    });

    test("retains authored input separately from derived editor output", () => {
        const document = body('<site-shell><h1 slot="content">Title</h1></site-shell>');

        expandCompositions(
            document.body,
            [{ id: "site-shell", compositionHTML: '<header>Brand</header><slot name="content"></slot>' }],
            "editor",
        );

        const host = document.querySelector("site-shell")!;
        expect(host.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)).toBe(true);
        const input = host.querySelector(`template[${COMPOSITION_INPUT_ATTRIBUTE}]`) as HTMLTemplateElement;
        expect(input.content.firstChild?.toString()).toBe('<h1 slot="content">Title</h1>');
        expect(host.querySelector(`[${COMPOSITION_OUTPUT_ATTRIBUTE}]`)?.innerHTML).toContain(
            '<h1 data-p9r-composition-authored="content">Title</h1>',
        );
    });

    test("copies host attributes to an explicit behavior controller", () => {
        const document = body('<account-form source-id="users"></account-form>');

        expandCompositions(document.body, [
            {
                id: "account-form",
                compositionHTML:
                    "<account-form-controller data-p9r-composition-controller><form></form></account-form-controller>",
            },
        ]);

        expect(document.body.innerHTML).toBe(
            '<account-form-controller source-id="users"><form></form></account-form-controller>',
        );
    });

    test("preserves site host bindings on the generated behavior controller", () => {
        const document = body(`<site-header cms-source="/.cms/sources/system-auth/me as auth">
            <a slot="actions" cms-condition="!auth.subject">Log in</a>
            <user-menu slot="actions" cms-condition="auth.subject">Account</user-menu>
        </site-header>`);

        expandCompositions(document.body, [
            {
                id: "site-header",
                compositionHTML:
                    '<site-navbar data-p9r-composition-controller><slot name="actions" slot="actions"></slot></site-navbar>',
            },
        ]);

        const navbar = document.querySelector("site-navbar")!;
        expect(navbar.getAttribute("cms-source")).toBe("/.cms/sources/system-auth/me as auth");
        expect(navbar.hasAttribute("data-p9r-composition-controller")).toBe(false);
        expect(navbar.querySelector('a[slot="actions"]')?.getAttribute("cms-condition")).toBe("!auth.subject");
        expect(navbar.querySelector('user-menu[slot="actions"]')?.getAttribute("cms-condition")).toBe("auth.subject");
    });
});

function body(html: string): Document {
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = html;
    return document;
}
