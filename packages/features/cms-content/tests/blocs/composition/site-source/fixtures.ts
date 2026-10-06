import type { SiteBlocDefinition, SiteBlocSnapshot } from "@bernouy/cms-content";

export const publishedSnapshot: SiteBlocSnapshot = {
    name: "Hero",
    group: "Layout",
    description: "Reusable hero",
    structure: [
        {
            kind: "bloc",
            tag: "basic-container",
            attributes: { width: "wide", "aria-label": 'A "<&' },
            children: [
                { kind: "slot", slotId: "title" },
                { kind: "slot", slotId: "content" },
            ],
        },
    ],
    slots: [
        {
            id: "title",
            label: "Title",
            slot: "title",
            min: 1,
            max: 1,
            accepts: [
                { kind: "media", accept: ["video", "image"] },
                { kind: "component", tag: "basic-heading-1" },
            ],
        },
        {
            id: "content",
            label: "Content",
            accepts: [{ kind: "any-component" }],
        },
    ],
    defaultContent: '<h1 slot="title">Hello</h1><p>Body</p>',
    dependencies: ["layout-shell", "basic-container"],
};

export function definition(overrides: Partial<SiteBlocDefinition> = {}): SiteBlocDefinition {
    return {
        schema: "cms.site-bloc.v1",
        id: "01-site-hero",
        tag: "site-hero",
        ownership: { kind: "site-builder", definitionId: "01-site-hero" },
        lifecycle: "active",
        draftRevision: 3,
        publishedRevision: 2,
        draft: publishedSnapshot,
        published: publishedSnapshot,
        createdAt: new Date("2026-07-01T10:00:00.000Z"),
        updatedAt: new Date("2026-07-02T11:30:00.000Z"),
        ...overrides,
    };
}
