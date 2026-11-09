import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureCollectionSources, compileCollectionSources } from "@bernouy/repository/repository/authoring/build";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";

export async function sourceFixture() {
    const root = await mkdtemp(join(tmpdir(), "repository-source-build-"));
    const directory = join(root, "source", "kit");
    await mkdir(join(directory, "translations", "en"), { recursive: true });
    await mkdir(join(directory, "assets"));
    await writeFile(
        join(directory, "definition.json"),
        JSON.stringify({
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "publisher/kit",
            publisherId: "publisher",
            version: "1.0.0",
            name: "collection.name",
            description: "collection.description",
            locale: "en",
            exports: "*",
        }),
    );
    await writeFile(
        join(directory, "translations/en/metadata.json"),
        JSON.stringify({
            "collection.name": "Kit",
            "collection.description": "Editable test collection",
        }),
    );
    await writeFile(join(directory, "assets/data.txt"), "immutable source bytes");
    const captured = await captureCollectionSources(directory);
    const built = await compileCollectionSources(
        join(root, "builds"),
        captured.sourceJson,
        captured.assets,
        new InMemoryReleaseCatalogue(),
    );
    return {
        root,
        directory,
        captured,
        ...built,
        envelope: {
            kind: "collection" as const,
            canonicalJson: built.admission.canonicalJson,
            sourceJson: built.sourceJson,
            assets: built.admission.assets,
        },
        close: () => rm(root, { recursive: true, force: true }),
    };
}
