import { expect, test } from "bun:test";
import { getCmsEditorCatalogue } from "@bernouy/cms-content";

test("editor catalogue projects deterministic delivery authoring contracts", async () => {
    const getBlocsList = async () => [
        {
            id: "sample-hidden",
            name: "Hidden",
            group: "Internal",
            description: "",
            internal: true,
            ownership: { kind: "code-managed" as const },
        },
        {
            id: "sample-control",
            name: "Control only",
            group: "Administration",
            description: "",
            surfaces: ["control" as const],
            ownership: { kind: "code-managed" as const },
        },
        {
            id: "sample-card",
            name: "Card",
            group: "Content",
            catalogueOrder: 20,
            description: "A reusable card.",
            surfaces: ["delivery" as const],
            defaultContent: "<p>Card copy</p>",
            slots: { actions: { max: 1, accepts: [{ kind: "any-component" as const }] } },
            settings: [
                {
                    id: "featured",
                    label: "Featured",
                    type: "boolean" as const,
                    default: false,
                    control: { kind: "toggle" as const },
                },
            ],
            ownership: { kind: "code-managed" as const },
        },
        {
            id: "sample-hero",
            name: "Hero",
            group: "Content",
            catalogueOrder: 10,
            description: "A hero composition.",
            compositionHTML: '<section><slot name="content"></slot></section>',
            ownership: { kind: "site-builder" as const, definitionId: "hero" },
        },
    ];

    const result = await getCmsEditorCatalogue({ getBlocsList } as never, { surface: "delivery" });

    expect(result.items.map(({ id }) => id)).toEqual(["sample-hero", "sample-card"]);
    expect(result.items[0]).toMatchObject({
        kind: "composition",
        ownership: "site-builder",
        order: 10,
        defaultContent: "",
    });
    expect(JSON.parse(result.items[1]!.authoringJson)).toEqual({
        settings: [
            {
                control: { kind: "toggle" },
                default: false,
                id: "featured",
                label: "Featured",
                type: "boolean",
            },
        ],
        slots: { actions: { accepts: [{ kind: "any-component" }], max: 1 } },
    });
});

test("editor catalogue rejects an unknown Page surface", async () => {
    await expect(
        getCmsEditorCatalogue({ getBlocsList: async () => [] } as never, { surface: "email" as never }),
    ).rejects.toThrow("Invalid editor surface");
});
