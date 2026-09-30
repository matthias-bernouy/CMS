import { describe, expect, test } from "bun:test";
import { checkDemoBlocs as check, demoComponent as component, demoComposition as composition } from "./fixtures";

describe("collection markup admission", () => {
    test.each([
        '<div cms-source="source"></div>',
        "<div>&#123;&#123; data }}</div>",
        '<div data-state="#{id}"></div>',
        "<cms-host></cms-host>",
    ])("rejects dynamic shadow markup %s", (shadowdom) => {
        expect(() => check([component({ shadowdom, slots: {} })])).toThrow("shadow shells");
    });

    test("requires a component and a single real root for cms-host", () => {
        const lightdom = '<cms-host><slot name="body" slot="body"></slot></cms-host>';
        expect(() => check([component({ lightdom })])).not.toThrow();
        expect(() => check([composition({ lightdom })])).toThrow("requires a component");
        expect(() => check([component({ lightdom: `${lightdom}<p>extra</p>` })])).toThrow("single root");
        expect(() => check([component({ lightdom: `<div>${lightdom}</div>` })])).toThrow("single root");
    });

    test("reads real HTML nodes and decoded attributes, ignoring comments", () => {
        const shadowdom =
            '<!-- <slot name="fake"> --><section data-layout="a > b"><slot name="bo&#100;y"></slot></section>';
        expect(() => check([component({ shadowdom })])).not.toThrow();
    });

    test("requires all page slots to be named and declared in both directions", () => {
        expect(() => check([component({ slots: {} })])).toThrow("must declare page slot");
        expect(() => check([component({ slots: { body: {}, missing: {} } })])).toThrow("does not exist");
        expect(() => check([composition({ lightdom: "<slot></slot>", slots: {} })])).toThrow("must have a name");
    });

    test("resolves slot targets against their actual parent, not unrelated shells", () => {
        const card = component({ shadowdom: '<slot name="heading"></slot>', slots: { heading: {} } });
        const page = composition({
            uses: ["demo-card"],
            lightdom: '<demo-card><p slot="heading">Title</p></demo-card>',
            slots: {},
        });
        expect(() => check([card, page])).not.toThrow();
        expect(() => check([card, { ...page, lightdom: '<div><p slot="heading">Lost</p></div>' }])).toThrow(
            "direct parent",
        );
        expect(() => check([card, { ...page, lightdom: '<demo-card><p slot="missing">Lost</p></demo-card>' }])).toThrow(
            "direct parent",
        );
    });

    test("allows forwarded substitution names and validates editable defaults", () => {
        const card = component({
            shadowdom: '<slot name="shell"></slot>',
            lightdom: '<slot name="body" slot="shell"></slot>',
            defaultContent: '<p slot="body">Initial</p>',
        });
        const page = composition({
            uses: ["demo-card"],
            lightdom: '<demo-card><p slot="body">Content</p></demo-card>',
            slots: {},
        });
        expect(() => check([card, page])).not.toThrow();
        expect(() => check([{ ...card, defaultContent: '<p slot="shell">Wrong interface</p>' }])).toThrow(
            "direct parent",
        );
    });

    test("requires fixed placed blocs to be known and declared", () => {
        expect(() => check([composition({ slots: {}, lightdom: "<demo-missing></demo-missing>" })])).toThrow(
            "unknown local bloc",
        );
        expect(() => check([component(), composition({ slots: {}, lightdom: "<demo-card></demo-card>" })])).toThrow(
            "declared in uses",
        );
    });

    test.each(["shadowdom", "lightdom", "defaultContent"])("excludes script and event handlers in %s", (field) => {
        const source = component({ shadowdom: "<div></div>", slots: {} });
        expect(() => check([{ ...source, [field]: "<script>run()</script>" }])).toThrow("script elements");
        expect(() => check([{ ...source, [field]: '<button oNclick="run()">Run</button>' }])).toThrow(
            "event-handler attributes",
        );
    });

    test("places nested blocs in lightdom, outside static shadow shells", () => {
        const shell = component({ shadowdom: "<demo-page></demo-page>", slots: {}, uses: ["demo-page"] });
        expect(() => check([shell, composition()])).toThrow("layout and slots only");
    });

    test("forbids inline style attributes in every markup field", () => {
        expect(() => check([component({ shadowdom: '<p style="color:red">Text</p>', slots: {} })])).toThrow(
            "inline style attributes",
        );
        expect(() => check([composition({ lightdom: '<p style="color:red">Text</p>', slots: {} })])).toThrow(
            "inline style attributes",
        );
        expect(() =>
            check([
                composition({ lightdom: "<p>Text</p>", slots: {}, defaultContent: '<p style="color:red">Text</p>' }),
            ]),
        ).toThrow("inline style attributes");
    });

    test("allows class only in a shadow shell", () => {
        expect(() => check([component({ shadowdom: '<div class="card"></div>', slots: {} })])).not.toThrow();
        expect(() => check([composition({ lightdom: '<p class="card">Text</p>', slots: {} })])).toThrow(
            "class attributes belong only in shadowdom",
        );
        expect(() =>
            check([composition({ lightdom: "<p>Text</p>", slots: {}, defaultContent: '<p class="card">Text</p>' })]),
        ).toThrow("class attributes belong only in shadowdom");
    });

    test("allows bindings only in lightdom", () => {
        expect(() => check([composition({ lightdom: "<p>{{ cms.i18n.demo.title }}</p>", slots: {} })])).not.toThrow();
        expect(() => check([component({ shadowdom: "<div>{{ title }}</div>", slots: {} })])).toThrow("bindings");
        expect(() =>
            check([composition({ lightdom: "<p>Text</p>", slots: {}, defaultContent: "<p>{{ title }}</p>" })]),
        ).toThrow("bindings belong only in lightdom");
    });

    test.each([
        ["text", "<div>Hidden headline</div>"],
        ["link", '<a href="/products"><slot name="body"></slot></a>'],
        ["heading", "<h1></h1>"],
        ["image", '<img src="/image.jpg" alt="Product">'],
        ["URL attribute", '<div href="/products"></div>'],
        ["text attribute", '<div aria-label="Product"></div>'],
    ])("keeps crawlable %s out of shadowdom", (_, shadowdom) => {
        expect(() => check([component({ shadowdom, slots: shadowdom.includes("<slot") ? { body: {} } : {} })])).toThrow(
            "shadow shells",
        );
    });
});
