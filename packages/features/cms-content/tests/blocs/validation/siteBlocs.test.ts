import { describe, expect, test } from "bun:test";
import {
    ContentValidationError,
    validateBlocWrite,
    validateSiteBlocDefinition,
    validateSiteBlocSnapshot,
} from "@bernouy/cms-content";
import { siteBlocArtifact, siteBlocDefinition, siteBlocSnapshot } from "../siteBlocFixture";

describe("site bloc validation", () => {
    test("keeps composition templates and component views mutually exclusive", () => {
        const artifact = siteBlocArtifact();

        expect(validateBlocWrite({ ...artifact, viewJS: "", compositionHTML: "<slot></slot>" }).compositionHTML).toBe(
            "<slot></slot>",
        );
        expect(() => validateBlocWrite({ ...artifact, compositionHTML: "<slot></slot>" })).toThrow(
            ContentValidationError,
        );
        expect(() => validateBlocWrite({ ...artifact, viewJS: "", compositionHTML: "  " })).toThrow(
            ContentValidationError,
        );
        expect(() => validateBlocWrite({ ...artifact, internal: true, viewJS: "" })).toThrow(ContentValidationError);
        expect(() => validateBlocWrite({ ...artifact, id: "p" })).toThrow(/custom-element tag/);
        expect(validateBlocWrite({ ...artifact, nativeElement: { accepts: ["button", "a"] } }).nativeElement).toEqual({
            accepts: ["button", "a"],
        });
        expect(() => validateBlocWrite({ ...artifact, nativeElement: { accepts: ["div"] as never[] } })).toThrow(
            /nativeElement/,
        );
        expect(
            validateBlocWrite({
                ...artifact,
                nativeElement: {
                    accepts: ["input"],
                    attributes: { type: { required: true, values: ["checkbox"] } },
                },
            }).nativeElement,
        ).toMatchObject({ attributes: { type: { required: true, values: ["checkbox"] } } });
        expect(() => validateBlocWrite({ ...artifact, nativeElement: { accepts: [] } })).toThrow(/nativeElement/);
        expect(() =>
            validateBlocWrite({
                ...artifact,
                viewJS: "",
                compositionHTML: "<slot></slot>",
                nativeElement: { accepts: ["a"] },
            }),
        ).toThrow(/nativeElement/);
        expect(() =>
            validateBlocWrite({
                ...artifact,
                viewJS: "",
                compositionHTML: '<a href="javascript:run()">Run</a>',
            }),
        ).toThrow(/forbidden/);
    });

    test("rejects malformed runtime ownership without throwing native type errors", () => {
        for (const ownership of [null, { kind: "unknown" }, { kind: "site-builder", definitionId: 42 }]) {
            expect(() => validateBlocWrite({ ...siteBlocArtifact(), ownership } as never)).toThrow(
                ContentValidationError,
            );
        }

        const { ownership: _ownership, ...codeWrite } = siteBlocArtifact();
        expect(validateBlocWrite(codeWrite).ownership).toEqual({ kind: "code-managed" });
    });

    test("accepts only site-prefixed definitions with matching ownership", () => {
        expect(validateSiteBlocDefinition(siteBlocDefinition()).tag).toBe("site-feature-panel");
        expect(() => validateSiteBlocDefinition(siteBlocDefinition({ tag: "custom-panel" }))).toThrow(
            ContentValidationError,
        );
        expect(() =>
            validateSiteBlocDefinition(
                siteBlocDefinition({
                    ownership: { kind: "site-builder", definitionId: "another-definition" },
                }),
            ),
        ).toThrow(ContentValidationError);
    });

    test("derives sorted dependencies and accepts static private text", () => {
        const valid = validateSiteBlocSnapshot(
            siteBlocSnapshot({
                structure: [
                    { kind: "text", value: "Shared navigation" },
                    { kind: "bloc", tag: "z-card", attributes: {}, children: [] },
                    { kind: "bloc", tag: "a-card", attributes: {}, children: [] },
                    { kind: "bloc", tag: "z-card", attributes: {}, children: [] },
                ],
                dependencies: ["caller-input"],
            }),
            "site-feature-panel",
        );
        expect(valid.dependencies).toEqual(["a-card", "z-card"]);
        expect(valid.structure[0]).toEqual({ kind: "text", value: "Shared navigation" });
        expect(() =>
            validateSiteBlocSnapshot(siteBlocSnapshot({ structure: [{ kind: "text", value: "{{ private.value }}" }] })),
        ).toThrow(ContentValidationError);
    });

    test("accepts validated bindings in the light-DOM site bloc structure", () => {
        const valid = validateSiteBlocSnapshot(
            siteBlocSnapshot({
                structure: [
                    {
                        kind: "bloc",
                        tag: "site-results",
                        attributes: {
                            "cms-query": "catalog:search as results",
                            "cms-query-input": '{"query":{"from":"state","key":"@param:site-query"}}',
                        },
                        children: [
                            {
                                kind: "bloc",
                                tag: "section",
                                attributes: { "cms-condition": "results.items" },
                                children: [],
                            },
                        ],
                    },
                ],
            }),
            "site-feature-panel",
        );

        expect(valid.structure).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    attributes: expect.objectContaining({
                        "cms-query": "catalog:search as results",
                    }),
                }),
            ]),
        );
        const rejectedAttributes = [
            { "cms-query": "https://example.com/private" },
            ...[
                "cms-binding-disabled",
                "cms-bind-stop",
                "cms-ready",
                "cms-reload-on",
                "cms-source-publish",
                "cms-source-state-force",
            ].map((name) => ({ [name]: "" })),
        ];
        for (const attributes of rejectedAttributes) {
            expect(() =>
                validateSiteBlocSnapshot(
                    siteBlocSnapshot({
                        structure: [{ kind: "bloc", tag: "site-results", attributes, children: [] }],
                    }),
                    "site-feature-panel",
                ),
            ).toThrow(ContentValidationError);
        }
    });

    test("accepts automatic idempotency only on mutation forms", () => {
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [
                        {
                            kind: "bloc",
                            tag: "form",
                            attributes: {
                                "cms-mutation": "catalog:apply as applied",
                                "cms-mutation-idempotency": "auto",
                            },
                            children: [],
                        },
                    ],
                }),
            ),
        ).not.toThrow();
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [
                        {
                            kind: "bloc",
                            tag: "form",
                            attributes: {
                                "cms-mutation": "catalog:apply as applied",
                                "cms-mutation-idempotency": "manual",
                            },
                            children: [],
                        },
                    ],
                }),
            ),
        ).toThrow(/idempotency/);
    });

    test("rejects unknown slots, duplicate ids, self references, and invalid public names", () => {
        expect(() =>
            validateSiteBlocSnapshot(siteBlocSnapshot({ structure: [{ kind: "slot", slotId: "missing" }] })),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        ...siteBlocSnapshot().slots,
                        { id: "body", label: "Duplicate", accepts: [{ kind: "any-component" }] },
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [{ id: "", label: "Empty id", accepts: [{ kind: "any-component" }] }],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [{ kind: "bloc", tag: "site-feature-panel", attributes: {}, children: [] }],
                }),
                "site-feature-panel",
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Body",
                            slot: "Bad Name",
                            accepts: [{ kind: "any-component" }],
                        },
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
    });

    test("rejects malformed runtime slot and attribute shapes with domain errors", () => {
        expect(() => validateSiteBlocSnapshot(siteBlocSnapshot({ slots: [null] as never }))).toThrow(
            ContentValidationError,
        );
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [
                        {
                            kind: "bloc",
                            tag: "basic-card",
                            attributes: { tone: 42 },
                            children: [],
                        } as never,
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Body",
                            slot: 42,
                            accepts: [{ kind: "any-component" }],
                        } as never,
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [{ kind: "bloc", tag: "img", attributes: {}, children: null } as never],
                }),
            ),
        ).toThrow(ContentValidationError);
    });

    test("validates slot cardinality and publication metadata", () => {
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Body",
                            min: 2,
                            max: 1,
                            accepts: [{ kind: "any-component" }],
                        },
                    ],
                }),
            ),
        ).toThrow(ContentValidationError);
        expect(() => validateSiteBlocDefinition(siteBlocDefinition({ publishedRevision: 1, published: null }))).toThrow(
            ContentValidationError,
        );
    });

    test("validates default content recursively in its site-bloc parent context", () => {
        for (const [defaultContent, message] of [
            ["<span>Root text</span>", /explicit component text slot/],
            ["<li>Orphan item</li>", /direct child/],
            ["<ul><site-card>Not a list item</site-card></ul>", /only direct <li>/],
            ["<ul>Loose text<li>Item</li></ul>", /only direct <li>/],
            ['<section><span slot="label">Nested slot bypass</span></section>', /direct custom-element child/],
            ["<form></form>", /declared CMS mutation/],
            [
                `<form cms-mutation="forms:contact as contact"
                    cms-mutation-input='{"safe":{"from":"literal","value":"yes"},"bad":{"from":"cookie"}}'></form>`,
                /typed parameter map/,
            ],
            [
                `<form cms-mutation="kernel.auth:login as session"
                    cms-mutation-redirect-param="bad param"></form>`,
                /redirect parameter is invalid/,
            ],
        ] as const) {
            expect(() => validateSiteBlocSnapshot(siteBlocSnapshot({ defaultContent }), "site-feature-panel")).toThrow(
                message,
            );
        }

        const valid = validateSiteBlocSnapshot(
            siteBlocSnapshot({
                defaultContent: `<h2 slot="title">Contact</h2><form
                    cms-mutation="forms:contact as contact"
                    cms-mutation-redirect="/thanks" cms-mutation-redirect-param="returnTo"></form>`,
            }),
            "site-feature-panel",
        );
        expect(valid.defaultContent).toContain('cms-mutation="forms:contact as contact"');
        expect(valid.defaultContent).toContain('cms-mutation-redirect-param="returnTo"');
    });

    test("allows controlled CMS forms in the site bloc structure", () => {
        const form = {
            kind: "bloc" as const,
            tag: "form",
            attributes: {
                "cms-mutation": "system-auth:logout as logout",
                "cms-mutation-redirect": "/login",
            },
            children: [],
        };

        const valid = validateSiteBlocSnapshot(
            siteBlocSnapshot({
                structure: [form],
            }),
            "site-feature-panel",
        );
        expect(valid.structure).toEqual([form]);
        expect(() =>
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [{ kind: "bloc", tag: "form", attributes: {}, children: [] }],
                }),
                "site-feature-panel",
            ),
        ).toThrow(/declared CMS mutation/);
    });

    test("enforces native list children in private structure", () => {
        for (const child of [
            { kind: "text", value: "Loose text" },
            { kind: "bloc", tag: "site-card", attributes: {}, children: [] },
        ] as const) {
            expect(() =>
                validateSiteBlocSnapshot(
                    siteBlocSnapshot({
                        structure: [{ kind: "bloc", tag: "ul", attributes: {}, children: [child] }],
                    }),
                    "site-feature-panel",
                ),
            ).toThrow(/only direct <li>/);
        }
    });
});
