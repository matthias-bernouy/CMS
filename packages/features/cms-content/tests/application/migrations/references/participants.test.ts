import { expect, test } from "bun:test";
import { referenceFixture, release } from "./fixture";

test("blocks removal of a collection Page used by an external feature", async () => {
    const fixture = await referenceFixture({
        translations: {
            en: { "collection.name": "Atlas", "bloc.label": "Card", "view.name": "Legacy view" },
        },
        pages: [controlPage("legacy", "<p>Legacy</p>")],
    });
    const next = await fixture.collections.importRelease({
        ...release("2.0.0", "atlas-card"),
        dataGeneration: 2,
        migrations: [{ fromGeneration: 1, toGeneration: 2, operations: [] }],
    });
    fixture.service.addParticipant({
        id: "external-pages",
        async collectReferences() {
            return [{ kind: "page", collectionId: "atlas", id: "legacy", location: "Control page" }];
        },
    });

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.blockedReasons).toContain("Control page still references removed collection page atlas:legacy.");
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
    for (const kind of ["bloc", "theme-token", "configuration", "text", "asset"]) {
        expect(plan.blockedReasons).toContainEqual(expect.stringContaining(`collection ${kind}`));
    }
});

test("digests participant resource identities independently from diagnostic labels", async () => {
    const patch = {
        translations: {
            en: { "collection.name": "Atlas", "bloc.label": "Card", "view.name": "Overview" },
        },
        pages: [controlPage("overview", "<p>Overview</p>")],
    };
    const fixture = await referenceFixture(patch);
    const next = await fixture.collections.importRelease({ ...release("1.1.0", "atlas-card"), ...patch });
    let location = "Control page one";
    fixture.service.addParticipant({
        id: "control-pages",
        async collectReferences() {
            return [{ kind: "page", collectionId: "atlas", id: "overview", location }];
        },
    });
    const first = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    location = "Renamed Control page";
    const second = await fixture.service.plan("site", [{ digest: next.digest }], 1);

    expect(first.planDigest).toBe(second.planDigest);
    expect(() =>
        fixture.service.addParticipant({
            id: "control-pages",
            async collectReferences() {
                return [];
            },
        }),
    ).toThrow("Duplicate collection migration participant");
});

test("prepares feature state for the exact forward and rollback collection targets", async () => {
    const fixture = await referenceFixture();
    const next = await fixture.collections.importRelease(release("1.1.0", "atlas-card"));
    const prepared: string[][] = [];
    fixture.service.addParticipant({
        id: "execution-grants",
        async collectReferences() {
            return [];
        },
        async prepareTarget({ collections }) {
            prepared.push(collections.map(({ release: target }) => target.version));
        },
    });

    const completed = await fixture.service.execute("site", [{ digest: next.digest }], 1);
    await fixture.service.rollback("site", completed.id);

    expect(prepared).toEqual([["1.1.0"], ["1.0.0"]]);
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
                "token.accent": "Accent",
                "view.name": "Legacy view",
            },
        },
        pages: [controlPage("legacy", "<p>Legacy</p>")],
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
        { kind: "asset" as const, collectionId: "atlas", id: "legacy.svg", location: "External workflow" },
    ];
}

function controlPage(id: string, html: string) {
    return {
        id,
        surface: "control",
        defaultPath: id === "overview" ? "/admin" : `/admin/${id}`,
        name: "view.name",
        document: { html },
    };
}
