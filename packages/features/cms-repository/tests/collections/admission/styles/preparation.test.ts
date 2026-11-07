import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { prepareRemoteCollection } from "cms-repository/repository/authoring/preparations/prepare";

test("remote preparation reports the Bloc and property and leaves no publishable preparation", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-color-policy-"));
    const source = {
        files: [
            {
                path: "definition.json",
                content: JSON.stringify({
                    kind: "collection",
                    protocol: "ulvia-collection/v1",
                    schemaDialect: "ulvia-schema/v1",
                    publisherId: "atlas.official",
                    collectionId: "atlas.official/atlas",
                    version: "1.0.0",
                    name: "label",
                    locale: "en",
                }),
            },
            { path: "translations/en/base.json", content: '{"label":"Panel"}' },
            {
                path: "blocs/atlas-dofficial--atlas--panel/definition.json",
                content: JSON.stringify({
                    kind: "component",
                    id: "atlas-dofficial--atlas--panel",
                    label: "label",
                    description: "label",
                    categories: ["label"],
                    catalogue: "hidden",
                    root: { accepts: ["div"] },
                    slots: {},
                    uses: [],
                    requires: [],
                }),
            },
            { path: "blocs/atlas-dofficial--atlas--panel/markup.html", content: "<div></div>" },
            { path: "blocs/atlas-dofficial--atlas--panel/style.css", content: ":scope { background-color: #fff; }" },
        ],
    };
    try {
        await expect(
            prepareRemoteCollection(
                {
                    root,
                    contracts: new InMemoryReleaseCatalogue(),
                    readAsset: async () => {
                        throw new Error("No assets expected");
                    },
                },
                JSON.stringify(source),
                async () => {
                    throw new Error("Invalid sources must fail before remote preflight");
                },
            ),
        ).rejects.toThrow(/atlas-dofficial--atlas--panel.*background-color.*theme token/);
        // Keep the lock inode across refusals, but retain no source workspace.
        expect(await readdir(root)).toEqual([".write-lock"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
