import { expect, test } from "bun:test";
import { prepareImagePublication, remoteImageIdentity } from "../../../../infra/images/registry";
import { image, registryFixture } from "./fixture";

function indexedFixture() {
    const fixture = registryFixture();
    const runtime = fixture.put(fixture.runtime(), "runtime");
    const index = {
        schemaVersion: 2,
        mediaType: "application/vnd.oci.image.index.v1+json",
        manifests: [
            { mediaType: "application/vnd.oci.image.manifest.v1+json", digest: runtime.digest, size: runtime.size },
        ],
    };
    const root = fixture.put(index);
    return { ...fixture, runtime, index, root };
}

test.each(["index", "manifest", "config"])(
    "a verified %s Docker store ID survives publication retries",
    async (kind) => {
        const fixture = indexedFixture();
        const id = kind === "index" ? fixture.root.digest : kind === "manifest" ? fixture.runtime.digest : image.id;
        const artifact = { ...image, id };
        expect(await remoteImageIdentity(artifact, fixture.fetch)).toBe(id);
        const publication = await prepareImagePublication([artifact], fixture);
        await publication.publish();
        await publication.verify();
        expect(fixture.writes).toEqual([]);
    },
);

test("a direct runtime manifest can be the Docker store ID", async () => {
    const fixture = registryFixture();
    const runtime = fixture.put(fixture.runtime());
    const artifact = { ...image, id: runtime.digest };
    expect(await remoteImageIdentity(artifact, fixture.fetch)).toBe(runtime.digest);
    await (await prepareImagePublication([artifact], fixture)).publish();
    expect(fixture.writes).toEqual([]);
});

test("a replaced index with the same config cannot satisfy an index-pinned receipt", async () => {
    const fixture = indexedFixture();
    const artifact = { ...image, id: fixture.root.digest };
    fixture.put({ ...fixture.index, annotations: { changed: "metadata" } });
    await expect(prepareImagePublication([artifact], fixture)).rejects.toThrow("different content");
    expect(fixture.writes).toEqual([]);
});

test("a matching index digest cannot bypass runtime validation", async () => {
    const fixture = indexedFixture();
    const invalid = fixture.put({
        ...fixture.index,
        manifests: [...fixture.index.manifests, ...fixture.index.manifests],
    });
    await expect(remoteImageIdentity({ ...image, id: invalid.digest }, fixture.fetch)).rejects.toThrow("exactly one");
    fixture.documents.delete(fixture.runtime.digest);
    fixture.put(fixture.index);
    await expect(remoteImageIdentity({ ...image, id: fixture.root.digest }, fixture.fetch)).rejects.toThrow(
        "missing runtime",
    );
    const malformed = fixture.put({ ...fixture.index, mediaType: "application/vnd.oci.image.manifest.v1+json" });
    await expect(remoteImageIdentity({ ...image, id: malformed.digest }, fixture.fetch)).rejects.toThrow();
    expect(fixture.writes).toEqual([]);
});

test("a fresh index publication confirms the push and the next attempt skips it", async () => {
    const fixture = indexedFixture();
    const artifact = { ...image, id: fixture.root.digest };
    fixture.documents.delete("1.2.3");
    let pushes = 0;
    const transport = {
        fetch: fixture.fetch,
        run: async (args: readonly string[]) => {
            if (args[1] === "image") {
                return artifact.id;
            }
            expect(args).toEqual(["docker", "push", artifact.reference]);
            pushes++;
            fixture.put(fixture.index);
        },
    };
    await (await prepareImagePublication([artifact], transport)).publish();
    await (await prepareImagePublication([artifact], transport)).publish();
    expect(pushes).toBe(1);
});
