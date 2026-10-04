import { expect, test } from "bun:test";
import { referenceFixture, release } from "./fixture";

test("blocks removal of a collection text still referenced by a page", async () => {
    const fixture = await referenceFixture({ texts: [{ id: "legacy-title", values: { en: "Legacy" } }] });
    const next = await fixture.collections.importRelease({
        ...release("2.0.0", "atlas-card"),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [{ kind: "remove-text-override", id: "legacy-title" }],
            },
        ],
    });
    await fixture.repository.insertPage("/demo", "Demo", "<p>{{ cms.i18n.atlas.legacy-title }}</p>");

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.blockedReasons).toContainEqual(expect.stringContaining("collection text atlas.legacy-title"));
});

test("blocks target changes that would break a site-owned bloc", async () => {
    const fixture = await referenceFixture();
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
    await fixture.repository.createBloc({
        id: "local-shell",
        name: "Local shell",
        group: "Local",
        description: "",
        viewJS: "",
        compositionHTML: "<atlas-card></atlas-card>",
        ownership: { kind: "code-managed" },
    });

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.blockedReasons).toContainEqual(expect.stringContaining("Site bloc local-shell composition"));
});
