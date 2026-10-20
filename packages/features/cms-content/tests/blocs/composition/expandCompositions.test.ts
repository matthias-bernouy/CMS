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
        const document = body(
            `<div cms-bloc=\"site-layout\"><main slot="content"><a href="/work">Work</a></main></div>`,
        );

        expandCompositions(document.body, [
            {
                id: "site-layout",
                kind: "composition" as const,
                markupHTML: '<header><a href="/">Home</a></header><slot name="content"></slot><footer>Legal</footer>',
            },
        ]);

        expect(document.body.innerHTML).toBe(
            '<header><a href="/">Home</a></header><main part="content"><a href="/work">Work</a></main><footer>Legal</footer>',
        );
        expect(document.querySelectorAll("a[href]")).toHaveLength(2);
        expect(document.querySelector('[cms-bloc=\"site-layout\"]')).toBeNull();
    });

    test("keeps a component root while projecting its Light DOM template", () => {
        const document = body(
            '<article cms-bloc=\"test-card\" data-page="one"><h2 slot="title">Page title</h2></article>',
        );

        expandCompositions(document.body, [
            {
                id: "test-card",
                kind: "component" as const,
                markupHTML:
                    '<template cms-root cms-query="catalog:shared as data"></template><slot name="title"></slot><section><p>Shared copy</p></section>',
            },
        ]);

        const host = document.querySelector('[cms-bloc=\"test-card\"]')!;
        expect(host.getAttribute("cms-query")).toBe("catalog:shared as data");
        expect(host.querySelector("h2")?.getAttribute("part")).toBe("title");
        expect(host.textContent).toBe("Page titleShared copy");
    });

    test("keeps repeated component ids and accessibility references unique", () => {
        const document = body('<div cms-bloc="test-tabs"></div><div cms-bloc="test-tabs"></div>');

        expandCompositions(document.body, [
            {
                id: "test-tabs",
                kind: "component" as const,
                markupHTML:
                    '<a id="details-tab" href="#details" aria-controls="details">Details</a><section id="details" aria-labelledby="details-tab"></section>',
            },
        ]);

        const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]"), (element) => element.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(["details-tab", "details", "details-tab--cms-2", "details--cms-2"]);
        const repeatedLink = document.querySelector<HTMLAnchorElement>("#details-tab--cms-2")!;
        const repeatedPanel = document.querySelector<HTMLElement>("#details--cms-2")!;
        expect(repeatedLink.getAttribute("href")).toBe("#details--cms-2");
        expect(repeatedLink.getAttribute("aria-controls")).toBe("details--cms-2");
        expect(repeatedPanel.getAttribute("aria-labelledby")).toBe("details-tab--cms-2");
    });

    test("renders a changed shared composition for every page while preserving each page slot", () => {
        const document = body(
            '<div cms-bloc=\"test-banner\"><span slot="message">First</span></div><div cms-bloc=\"test-banner\"><span slot="message">Second</span></div>',
        );
        expandCompositions(document.body, [
            {
                id: "test-banner",
                kind: "composition" as const,
                markupHTML: '<section><p>Updated</p><slot name="message"></slot></section>',
            },
        ]);

        expect(Array.from(document.querySelectorAll("section")).map((section) => section.textContent)).toEqual([
            "UpdatedFirst",
            "UpdatedSecond",
        ]);
        expect(document.querySelectorAll('[cms-bloc=\"test-banner\"]')).toHaveLength(0);
    });

    test("remaps forwarded slots and expands nested compositions", () => {
        const document = body(
            '<div cms-bloc=\"outer-shell\"><a href="/account" slot="navigation">Account</a><p>Body</p></div>',
        );

        expandCompositions(document.body, [
            {
                id: "outer-shell",
                kind: "composition" as const,
                markupHTML:
                    '<div cms-bloc=\"inner-navigation\"><slot name="navigation" slot="items"></slot></div><slot></slot>',
            },
            {
                id: "inner-navigation",
                kind: "composition" as const,
                markupHTML: '<nav><slot name="items"></slot></nav>',
            },
        ]);

        expect(document.body.innerHTML).toBe(
            '<nav><a part="navigation items" href="/account">Account</a></nav><p>Body</p>',
        );
    });

    test("retains authored input separately from derived preview output", () => {
        const document = body('<div cms-bloc=\"site-shell\"><h1 slot="content">Title</h1></div>');

        expandCompositions(
            document.body,
            [
                {
                    id: "site-shell",
                    kind: "composition" as const,
                    markupHTML: '<header>Brand</header><slot name="content"></slot>',
                },
            ],
            "preview",
        );

        const host = document.querySelector('[cms-bloc=\"site-shell\"]')!;
        expect(host.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)).toBe(true);
        const input = host.querySelector(`template[${COMPOSITION_INPUT_ATTRIBUTE}]`) as HTMLTemplateElement;
        expect(input.content.firstChild?.toString()).toBe('<h1 slot="content">Title</h1>');
        expect(host.querySelector(`[${COMPOSITION_OUTPUT_ATTRIBUTE}]`)?.innerHTML).toContain(
            '<h1 data-cms-composition-authored="content" part="content">Title</h1>',
        );
    });

    test("copies host attributes to an explicit behavior controller", () => {
        const document = body('<form cms-bloc=\"account-form\" source-id="users"></form>');

        expandCompositions(document.body, [
            {
                id: "account-form",
                kind: "composition" as const,
                markupHTML: "<div data-cms-composition-controller><form></form></div>",
            },
        ]);

        expect(document.body.innerHTML).toBe('<div source-id="users"><form></form></div>');
    });

    test("preserves site host bindings on the generated behavior controller", () => {
        const document = body(`<header cms-bloc=\"site-header\" cms-query="ulvia.cms.access:resolve-actor as auth">
            <a slot="actions" cms-condition="!auth.data.subject">Log in</a>
            <div cms-bloc=\"user-menu\" slot="actions" cms-condition="auth.data.subject">Account</div>
        </header>`);

        expandCompositions(document.body, [
            {
                id: "site-header",
                kind: "composition" as const,
                markupHTML: '<nav data-cms-composition-controller><slot name="actions" slot="actions"></slot></nav>',
            },
        ]);

        const navbar = document.querySelector("nav")!;
        expect(navbar.getAttribute("cms-query")).toBe("ulvia.cms.access:resolve-actor as auth");
        expect(navbar.hasAttribute("data-cms-composition-controller")).toBe(false);
        expect(navbar.querySelector('a[slot="actions"]')?.getAttribute("cms-condition")).toBe("!auth.data.subject");
        expect(navbar.querySelector('[cms-bloc=\"user-menu\"][slot="actions"]')?.getAttribute("cms-condition")).toBe(
            "auth.data.subject",
        );
    });
});

function body(html: string): Document {
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = html;
    return document;
}
