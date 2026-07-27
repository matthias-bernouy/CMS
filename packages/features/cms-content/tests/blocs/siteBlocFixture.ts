import type { SiteBlocDefinition, SiteBlocSnapshot, TBloc } from "@bernouy/cms-content";

export function siteBlocSnapshot(overrides: Partial<SiteBlocSnapshot> = {}): SiteBlocSnapshot {
    return {
        name: "Feature panel",
        group: "Site",
        description: "A composed site bloc",
        structure: [
            {
                kind: "bloc",
                tag: "basic-section",
                attributes: { tone: "soft" },
                children: [{ kind: "slot", slotId: "body" }],
            },
        ],
        slots: [
            {
                id: "body",
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
        ],
        defaultContent: "<basic-paragraph>Start here</basic-paragraph>",
        dependencies: ["ignored-input"],
        ...overrides,
    };
}

export function siteBlocDefinition(overrides: Partial<SiteBlocDefinition> = {}): SiteBlocDefinition {
    const createdAt = new Date("2026-07-27T08:00:00.000Z");
    return {
        schema: "cms.site-bloc.v1",
        id: "definition-1",
        tag: "site-feature-panel",
        ownership: { kind: "site-builder", definitionId: "definition-1" },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: null,
        draft: siteBlocSnapshot(),
        published: null,
        createdAt,
        updatedAt: createdAt,
        ...overrides,
    };
}

export function siteBlocArtifact(overrides: Partial<TBloc> = {}): TBloc {
    return {
        id: "site-feature-panel",
        name: "Feature panel",
        group: "Site",
        description: "A composed site bloc",
        editorJS: "editor-artifact",
        viewJS: "view-artifact",
        ownership: { kind: "site-builder", definitionId: "definition-1" },
        source: { "builder.json": "e30=" },
        ...overrides,
    };
}
