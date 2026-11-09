import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/repository/collections/installations";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { collectionDocument } from "../../../collections/fixtures";
import { context, reference, services } from "./fixture";

test("large collection installation, detail, listing and configuration preserve exact counts and refusal atomicity", async () => {
    const source = {
        ...collectionDocument(),
        blocs: [],
        examples: [],
        configuration: { schema: { type: "object", properties: {}, required: [] }, defaults: {} },
        texts: Array.from({ length: 8192 }, (_, id) => ({
            id: `text-${id}`,
            category: "text.category.content",
            group: "text.group.general",
            label: "bloc.panel.label",
            values: { "en-US": "Hello" },
        })),
    };
    const store = new CollectionStore(new MemoryCollectionStorage(), new InMemoryReleaseCatalogue());
    const artifact = await store.importRelease(source);
    const ports = services({ collections: store, sources: undefined });
    const target = {
        ...reference,
        publisherId: "atlas.official",
        collectionId: "atlas.official/atlas",
        digest: artifact.digest,
    };
    const input = { expectedRevision: 0, targets: [target] };
    const run = (id: (typeof installationsFeature.capabilities)[number]["id"], input: unknown) =>
        executeCapability(installationsFeature, id, { input, services: ports, context });
    await expect(run("install-collection", input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await store.revision(context.siteId)).toBe(0);
    const installed = (await run("install-collections", input)) as { revision: number; items: { textCount: number }[] };
    expect(installed).toMatchObject({ revision: 1, items: [{ textCount: 8192 }] });
    const detail = await run("get-collection-details", { collectionId: target.collectionId });
    expect(detail).toMatchObject({ textCount: 8192, revision: 1 });
    expect(await run("list-installed-collections", {})).toMatchObject({ revision: 1, items: [{ textCount: 8192 }] });
    const configuration = { collectionId: target.collectionId, expectedRevision: 1, configurationJson: "{}" };
    await expect(run("update-collection-configuration", configuration)).rejects.toMatchObject({
        code: "INVALID_INPUT",
    });
    expect(await store.revision(context.siteId)).toBe(1);
    await expect(run("configure-collection", { ...configuration, siteId: "site-b" })).rejects.toThrow();
    expect(await store.revision("site-b")).toBe(0);
    expect(await run("configure-collection", configuration)).toMatchObject({
        revision: 2,
        items: [{ textCount: 8192 }],
    });
    await expect(run("configure-collection", configuration)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(await store.revision(context.siteId)).toBe(2);
});
