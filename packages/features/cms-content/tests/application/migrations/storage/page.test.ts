import { expect, test } from "bun:test";
import { migratePageContent } from "cms-content/application/migrations/transforms/page";
import { migrateTextOverrides } from "cms-content/application/migrations/transforms/siteData";

const renameText = { kind: "rename-text", from: "legacy-title", to: "title" } as const;

test("renames collection text references and their site overrides together", () => {
    const page = migratePageContent(
        "<p>{{ cms.i18n.atlas.legacy-title }}</p><p>{{ cms.i18n.other.legacy-title }}</p>",
        [renameText],
        "atlas",
    );

    expect(page).toEqual({
        content: "<p>{{ cms.i18n.atlas.title }}</p><p>{{ cms.i18n.other.legacy-title }}</p>",
        applied: 1,
    });
    expect(migrateTextOverrides({ "legacy-title": { en: "Hello" } }, [renameText])).toEqual({
        title: { en: "Hello" },
    });
});

test("renames qualified collection asset references without touching another owner", () => {
    const migrated = migratePageContent(
        '<img src="{{ cms.asset.atlas.old.svg }}"><a href="{{ cms.asset.other.old.svg }}">Download</a>',
        [{ kind: "rename-asset", from: "old.svg", to: "new.svg" }],
        "atlas",
    );

    expect(migrated.applied).toBe(1);
    expect(migrated.content).toContain("{{ cms.asset.atlas.new.svg }}");
    expect(migrated.content).toContain("{{ cms.asset.other.old.svg }}");
});
