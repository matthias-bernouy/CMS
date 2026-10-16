import { describe, expect, test } from "bun:test";
import { parseCollectionRelease } from "@bernouy/cms-repository/collections";
import {
    checkDemoBlocs as check,
    collectionDocument,
    demoComponent as component,
    demoComposition as composition,
    textDefinition,
} from "./fixtures";

describe("collection markup admission", () => {
    test("rejects the removed Shadow DOM contract", () => {
        expect(() => check([component({ shadowdom: "<div></div>" })])).toThrow('unknown property "shadowdom"');
        expect(() => check([component({ nativeElement: { accepts: ["div"] } })])).toThrow(
            'unknown property "nativeElement"',
        );
    });

    test("requires a native root contract on every Bloc", () => {
        const source = component();
        delete source.root;
        expect(() => check([source])).toThrow("root");
        const composed = composition();
        delete composed.root;
        expect(() => check([composed])).toThrow("root");
    });

    test("reads real template nodes and decoded slot names", () => {
        expect(() =>
            check([
                component({
                    template: '<section data-layout="a > b"><slot name="bo&#100;y"></slot></section>',
                }),
            ]),
        ).not.toThrow();
    });

    test("requires Page slots to be named and declared in both directions", () => {
        expect(() => check([component({ slots: {} })])).toThrow("must declare page slot");
        expect(() => check([component({ slots: { body: {}, missing: {} } })])).toThrow("does not exist");
        expect(() => check([composition({ lightdom: "<slot></slot>", slots: {} })])).toThrow("unnamed slot requires");
    });

    test("validates Page-owned native content separately from the Bloc root", () => {
        const input = component({
            id: "demo-checkbox",
            template: '<label><slot></slot><span part="label"></span></label>',
            slots: {},
            root: { accepts: ["div"] },
            content: {
                accepts: ["input"],
                attributes: { type: { required: true, values: ["checkbox"] } },
                defaults: { type: "checkbox" },
            },
            defaultContent: '<input type="checkbox">',
        });
        const page = composition({
            uses: ["demo-checkbox"],
            lightdom: '<div cms-bloc=\"demo-checkbox\"><input type="checkbox"></div>',
            slots: {},
        });
        expect(() => check([input, page])).not.toThrow();
        expect(() => check([{ ...input, defaultContent: "<input>" }])).toThrow("requires native attribute");
        expect(() =>
            check([input, { ...page, lightdom: '<div cms-bloc=\"demo-checkbox\"><input type="radio"></div>' }]),
        ).toThrow("invalid native attributes");
        expect(() => check([input, { ...page, lightdom: '<div cms-bloc=\"demo-checkbox\"></div>' }])).toThrow(
            "exactly one Page-owned native child",
        );
    });

    test("validates polymorphic semantic roots without wrapper custom elements", () => {
        const action = component({
            root: { accepts: ["button", "a"], defaults: { type: "button" } },
            content: { accepts: ["span"] },
            template: '<span part="label"><slot></slot></span>',
            slots: {},
            defaultContent: "<span>Action</span>",
        });
        const page = composition({
            uses: ["demo-card"],
            lightdom: '<a cms-bloc=\"demo-card\" href="/about"><span>About</span></a>',
            slots: {},
        });
        expect(() => check([action, page])).not.toThrow();
        expect(() =>
            check([action, { ...page, lightdom: '<a cms-bloc=\"demo-card\"><span>About</span></a>' }]),
        ).toThrow("declare href");
        expect(() =>
            check([
                action,
                {
                    ...page,
                    lightdom: '<a cms-bloc=\"demo-card\" href="/about"><span>About</span><button>Nested</button></a>',
                },
            ]),
        ).toThrow("cannot nest interactive content");
    });

    test("resolves slot targets against their direct Bloc parent", () => {
        const card = component({
            template: '<slot name="heading"></slot>',
            slots: { heading: { accepts: [{ kind: "native-content", profile: "inline" }] } },
        });
        const page = composition({
            uses: ["demo-card"],
            lightdom: '<div cms-bloc=\"demo-card\"><p slot="heading">Title</p></div>',
            slots: {},
        });
        expect(() => check([card, page])).not.toThrow();
        expect(() => check([card, { ...page, lightdom: '<div><p slot="heading">Lost</p></div>' }])).toThrow(
            "direct parent",
        );
        expect(() =>
            check([card, { ...page, lightdom: '<div cms-bloc=\"demo-card\"><p slot="missing">Lost</p></div>' }]),
        ).toThrow("direct parent");
    });

    test("requires fixed placed Blocs to be known and declared", () => {
        expect(() =>
            check([
                composition({
                    slots: {},
                    uses: ["demo-missing"],
                    lightdom: '<div cms-bloc=\"demo-missing\"></div>',
                }),
            ]),
        ).toThrow("neither local nor imported");
        expect(() =>
            check([component(), composition({ slots: {}, uses: [], lightdom: '<div cms-bloc=\"demo-card\"></div>' })]),
        ).toThrow("declared in uses");
    });

    test.each(["template", "lightdom", "defaultContent"])("excludes script and event handlers in %s", (field) => {
        const source =
            field === "lightdom" ? composition({ slots: {} }) : component({ template: "<div></div>", slots: {} });
        expect(() => check([{ ...source, [field]: "<script>run()</script>" }])).toThrow("script elements");
        expect(() => check([{ ...source, [field]: '<button onclick="run()">Run</button>' }])).toThrow(
            "event-handler attributes",
        );
    });

    test("applies the shared stored-document security policy to composition Light DOM", () => {
        for (const lightdom of [
            '<iframe srcdoc="<script>run()</script>"></iframe>',
            '<object data="https://example.invalid/payload"></object>',
            '<a href="javascript:run()">Run</a>',
        ]) {
            expect(() => check([composition({ lightdom, slots: {} })])).toThrow();
        }
    });

    test("requires nested Blocs in templates to be declared", () => {
        const nested = component({ template: '<div cms-bloc=\"demo-page\"></div>', slots: {}, uses: [] });
        expect(() => check([nested, composition()])).toThrow("declared in uses");
    });

    test("any-component slots reject compositions", () => {
        expect(() =>
            check([
                component({ slots: { body: { accepts: [{ kind: "any-component" }] } } }),
                composition({ id: "demo-nested", slots: {}, uses: [], lightdom: "<div></div>" }),
                composition({
                    slots: {},
                    uses: ["demo-card", "demo-nested"],
                    lightdom: '<div cms-bloc=\"demo-card\"><div cms-bloc=\"demo-nested\" slot="body"></div></div>',
                }),
            ]),
        ).toThrow("does not accept Bloc demo-nested");
    });

    test("allows structural classes only in component templates", () => {
        expect(() => check([component({ template: '<div class="card"></div>', slots: {} })])).not.toThrow();
        expect(() => check([composition({ lightdom: '<p class="card">Text</p>', slots: {} })])).toThrow(
            "class attributes belong only in a Bloc template",
        );
        expect(() =>
            check([component({ template: "<div></div>", slots: {}, defaultContent: '<p class="card">Text</p>' })]),
        ).toThrow("class attributes belong only in a Bloc template");
    });

    test("resolves collection text bindings in authored Light DOM", () => {
        const source = collectionDocument();
        source.texts = [textDefinition("title", { "en-US": "Title" })];
        const composed = (source.blocs as Record<string, unknown>[])[1]!;
        composed.lightdom =
            '<div cms-bloc=\"atlas-panel\"><slot name="main" slot="body"><p>{{ cms.i18n.atlas.title }}</p></slot></div>';
        expect(() => parseCollectionRelease(source)).not.toThrow();
        composed.lightdom =
            '<div cms-bloc=\"atlas-panel\"><slot name="main" slot="body"><p>{{ cms.i18n.atlas.missing }}</p></slot></div>';
        expect(() => parseCollectionRelease(source)).toThrow("unknown collection text missing");
    });

    test("rejects hardcoded user-facing copy in defaults and Pages", () => {
        const source = collectionDocument({ "page.demo.name": "Demo" });
        (source.blocs as Record<string, unknown>[])[0]!.defaultContent = '<p slot="body">Hardcoded copy</p>';
        expect(() => parseCollectionRelease(source)).toThrow("user-facing copy");

        delete (source.blocs as Record<string, unknown>[])[0]!.defaultContent;
        source.pages = [
            {
                id: "demo",
                defaultPath: "/demo",
                name: "page.demo.name",
                document: {
                    html: '<div cms-bloc=\"atlas-panel\"><p slot="body">Hardcoded copy</p></div>',
                },
            },
        ];
        expect(() => parseCollectionRelease(source)).toThrow("user-facing copy");
    });
});
