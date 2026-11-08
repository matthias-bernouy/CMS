import { expect, test } from "bun:test";
import { InMemoryContentRepository, createContentReader } from "@bernouy/content";
import { MemoryResourceMetadataStore } from "../../src/exports/memory";
import { ResourceTexts, resourceTextSource, withResourceTexts } from "../../src/exports/storage";

const source = {
    namespace: "acme/base",
    locale: "en",
    texts: [
        { id: "welcome", category: "General", group: "Base", label: "Welcome", values: { en: "Hello", fr: "Bonjour" } },
    ],
};

test("ordinary texts preserve defaults, regional fallback, site overrides and explicit reset", async () => {
    const metadata = new MemoryResourceMetadataStore("instance-a:default");
    const texts = new ResourceTexts(metadata);
    await texts.createExact(source);
    const original = await texts.snapshot();
    const before = original.sources[0]!;
    expect(resourceTextSource(before).resolve("fr-CA")).toEqual({ welcome: "Bonjour" });
    const changed = await texts.save(source.namespace, "welcome", "fr", "Salut", before.revision);
    expect(resourceTextSource(changed).resolve("fr-CA")).toEqual({ welcome: "Salut" });
    expect((await texts.snapshot()).revision).not.toBe(original.revision);
    const reset = await texts.save(source.namespace, "welcome", "fr", null, changed.revision);
    expect(resourceTextSource(reset).resolve("fr-CA")).toEqual({ welcome: "Bonjour" });
    expect(reset.source).toEqual(source);
    expect(reset.overrides).toEqual({});
});

test("stale and invalid text writes refuse without changing ordinary text state", async () => {
    const texts = new ResourceTexts(new MemoryResourceMetadataStore("instance-a:default"));
    await texts.createExact(source);
    const current = (await texts.snapshot()).sources[0]!;
    for (const patch of [
        { id: "unknown", locale: "en", value: "value", revision: current.revision },
        { id: "welcome", locale: "EN", value: "value", revision: current.revision },
        { id: "welcome", locale: "en", value: "{{ nested }}", revision: current.revision },
        { id: "welcome", locale: "en", value: "value", revision: "stale" },
    ]) {
        await expect(
            texts.save(source.namespace, patch.id, patch.locale, patch.value, patch.revision),
        ).rejects.toBeInstanceOf(Error);
        expect((await texts.snapshot()).sources[0]).toEqual(current);
    }
    const attempts = await Promise.allSettled([
        texts.save(source.namespace, "welcome", "en", "One", current.revision),
        texts.save(source.namespace, "welcome", "en", "Two", current.revision),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
});

test("Content resolves ordinary text records and notices edits without reading a ZIP", async () => {
    const texts = new ResourceTexts(new MemoryResourceMetadataStore("instance-a:default"));
    const other = new ResourceTexts(new MemoryResourceMetadataStore("instance-b:default"));
    await texts.createExact(source);
    const reader = createContentReader(withResourceTexts(new InMemoryContentRepository(), texts));
    expect((await reader.getContentTexts())[0]?.resolve("en")).toEqual({ welcome: "Hello" });
    expect((await other.snapshot()).sources).toEqual([]);
    await expect(
        other.save(source.namespace, "welcome", "en", "Foreign", (await texts.snapshot()).sources[0]!.revision),
    ).rejects.toBeInstanceOf(Error);
    const before = await reader.getContentRevision();
    await texts.save(source.namespace, "welcome", "en", "Changed", (await texts.snapshot()).sources[0]!.revision);
    expect(await reader.getContentRevision()).not.toBe(before);
    expect((await reader.getContentTexts())[0]?.resolve("en")).toEqual({ welcome: "Changed" });
});
