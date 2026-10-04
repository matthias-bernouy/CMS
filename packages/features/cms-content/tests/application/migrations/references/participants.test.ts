import { expect, test } from "bun:test";
import { referenceFixture, release } from "./fixture";

test("blocks removal of a collection view used by a site dashboard", async () => {
    const fixture = await referenceFixture({
        translations: {
            en: { "collection.name": "Atlas", "bloc.label": "Card", "view.name": "Legacy view" },
        },
        views: [{ id: "legacy", name: "view.name", html: "<p>Legacy</p>" }],
    });
    const next = await fixture.collections.importRelease({
        ...release("2.0.0", "atlas-card"),
        dataGeneration: 2,
        migrations: [{ fromGeneration: 1, toGeneration: 2, operations: [] }],
    });
    fixture.service.addParticipant({
        id: "dashboards",
        async collectReferences() {
            return [{ kind: "view", collectionId: "atlas", id: "legacy", location: "Dashboard Operations" }];
        },
    });

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.blockedReasons).toContain(
        "Dashboard Operations still references removed collection view atlas:legacy.",
    );
});

test("blocks every externally referenced collection resource kind", async () => {
    const fixture = await referenceFixture(previousResources());
    const next = await fixture.collections.importRelease({
        ...release("2.0.0", "atlas-panel"),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [{ kind: "rename-bloc", from: "atlas-card", to: "atlas-panel" }],
            },
        ],
    });
    fixture.service.addParticipant({
        id: "external-feature",
        async collectReferences() {
            return externalReferences();
        },
    });

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    for (const kind of ["bloc", "theme-token", "configuration", "text", "dashboard"]) {
        expect(plan.blockedReasons).toContainEqual(expect.stringContaining(`collection ${kind}`));
    }
});

test("digests participant resource identities independently from diagnostic labels", async () => {
    const patch = {
        translations: {
            en: { "collection.name": "Atlas", "bloc.label": "Card", "view.name": "Overview" },
        },
        views: [{ id: "overview", name: "view.name", html: "<p>Overview</p>" }],
    };
    const fixture = await referenceFixture(patch);
    const next = await fixture.collections.importRelease({ ...release("1.1.0", "atlas-card"), ...patch });
    let location = "Dashboard One";
    fixture.service.addParticipant({
        id: "dashboards",
        async collectReferences() {
            return [{ kind: "view", collectionId: "atlas", id: "overview", location }];
        },
    });
    const first = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    location = "Renamed dashboard";
    const second = await fixture.service.plan("site", [{ digest: next.digest }], 1);

    expect(first.planDigest).toBe(second.planDigest);
    expect(() =>
        fixture.service.addParticipant({
            id: "dashboards",
            async collectReferences() {
                return [];
            },
        }),
    ).toThrow("Duplicate collection migration participant");
});

function previousResources(): Record<string, unknown> {
    return {
        configuration: { schema: { type: "object", properties: {}, required: [] }, defaults: {} },
        texts: [{ id: "legacy-title", values: { en: "Legacy" } }],
        theme: {
            label: "collection.name",
            categories: [
                {
                    id: "brand",
                    label: "collection.name",
                    tokens: [
                        {
                            id: "accent",
                            label: "token.accent",
                            type: "color",
                            defaults: { light: "#123456" },
                        },
                    ],
                },
            ],
        },
        translations: {
            en: {
                "collection.name": "Atlas",
                "bloc.label": "Card",
                "dashboard.name": "Legacy dashboard",
                "nav.legacy": "Legacy",
                "token.accent": "Accent",
                "view.name": "Legacy view",
            },
        },
        views: [{ id: "legacy", name: "view.name", html: "<p>Legacy</p>" }],
        dashboards: [
            {
                id: "legacy-dashboard",
                name: "dashboard.name",
                navigation: [{ id: "legacy", label: "nav.legacy", use: "legacy" }],
            },
        ],
    };
}

function externalReferences() {
    return [
        { kind: "bloc" as const, collectionId: "atlas", id: "atlas-card", location: "External workflow" },
        {
            kind: "theme-token" as const,
            collectionId: "atlas",
            id: "atlas-accent",
            location: "External workflow",
        },
        { kind: "configuration" as const, collectionId: "atlas", id: "atlas", location: "External workflow" },
        { kind: "text" as const, collectionId: "atlas", id: "legacy-title", location: "External workflow" },
        {
            kind: "dashboard" as const,
            collectionId: "atlas",
            id: "legacy-dashboard",
            location: "External workflow",
        },
    ];
}
