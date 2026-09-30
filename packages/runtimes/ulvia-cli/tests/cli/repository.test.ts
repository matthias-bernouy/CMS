import { expect, test } from "bun:test";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { startLocalRepository } from "../../src/runtime/repository";

test("local repository lists immutable metadata and serves matching release bytes", async () => {
    const server = await startLocalRepository(0);
    try {
        const source = new HttpCollectionRepository("local", server.url);
        const entries = await source.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ collectionId: "test", version: "1.3.2", blocCount: 8, hasTheme: true });
        const release = await source.get(entries[0]!);
        expect((await admitCollectionRelease(release)).digest).toBe(entries[0]!.digest);
        expect(release.blocs).toHaveLength(8);
        expect(release.theme?.categories.flatMap((category) => category.tokens)).toHaveLength(7);
        const card = release.blocs.find((bloc) => bloc.id === "test-feature-card");
        expect(card?.kind).toBe("component");
        if (card?.kind === "component") {
            expect(card.runtime?.viewJS).toContain("test-feature-card");
            expect(card.runtime?.editorJS).toContain("test-feature-card");
            expect(card.lightdom).toContain("feature-card-note");
            expect(card.defaultContent).toContain("Feature title");
            expect(card.settings).toEqual([
                {
                    id: "tone",
                    label: "Tone",
                    group: "Appearance",
                    type: "string",
                    enum: ["quiet", "accent"],
                    maxLength: 16,
                    default: "quiet",
                },
                {
                    id: "compact",
                    label: "Compact",
                    group: "Layout",
                    type: "boolean",
                    default: false,
                    visibleWhen: [{ setting: "tone", equals: "accent" }],
                },
            ]);
        }
        const textIds = new Set(release.texts?.map((entry) => entry.id));
        for (const bloc of release.blocs) {
            if (!bloc.lightdom) {
                continue;
            }
            for (const match of bloc.lightdom.matchAll(/cms\.i18n\.test\.([a-z-]+)/g)) {
                expect(textIds.has(match[1]!)).toBeTrue();
            }
        }
        expect((await fetch(`${server.url}/v1/collections/missing/test/1.3.2`)).status).toBe(404);
    } finally {
        server.stop();
    }
});
