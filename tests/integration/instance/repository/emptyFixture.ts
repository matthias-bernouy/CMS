import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { captureCollectionSources } from "@bernouy/repository/repository/authoring/build";

/** Keep publication evidence rebuildable even for a collection with no resources. */
export async function emptyCollectionFixture(publisherId: string, id: string, version: string) {
    const root = await mkdtemp(join(tmpdir(), "ulvia-empty-collection-"));
    const directory = join(root, id);
    try {
        await mkdir(join(directory, "translations/en"), { recursive: true });
        await writeFile(
            join(directory, "definition.json"),
            JSON.stringify({
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                publisherId,
                collectionId: `${publisherId}/${id}`,
                version,
                name: "name",
                locale: "en",
            }),
        );
        await writeFile(
            join(directory, "translations/en/name.json"),
            JSON.stringify({ name: "Empty test collection" }),
        );
        const captured = await captureCollectionSources(directory);
        const artifact = await prepareCollectionRelease(directory);
        return { ...artifact, sourceJson: captured.sourceJson };
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
