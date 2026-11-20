import { expect, spyOn, test } from "bun:test";
import { parseCollectionRelease } from "repository/collections/core/parsing/parseCollectionRelease";
import { admitCollectionReleaseJson } from "repository/collections/core/admission/admitCollectionRelease";
import { compileBlocStyle } from "repository/collections/core/validation/styles/compile";
import { CollectionStore } from "repository/collections/installations/core/CollectionStore";
import { MemoryCollectionStorage } from "repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";
import { colorCollection } from "../fixture";

const id = "atlas-dofficial--atlas--panel";
const frames = "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }";
const style = `${frames} :scope { animation: fade 1s; }`;

test("preserves the release digest of an unchanged stylesheet from before animation support", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.admitRelease(colorCollection(":scope { display: grid; }"));
    expect(artifact.digest).toBe("sha256:cec946affbc9f4a66a5a78564cf9fdd092e31ea6bf0c19554a8b80e775b21d9f");
});

test("keeps authored CSS while requiring canonical compiled CSS on every release read", async () => {
    const source = colorCollection(style);
    const storage = new MemoryCollectionStorage();
    const store = new CollectionStore(storage);
    const artifact = await store.admitRelease(source);
    const component = artifact.release.blocs.find((bloc) => bloc.id === id)!;
    expect(component.kind).toBe("component");
    if (component.kind !== "component") {
        throw new Error("Expected a component");
    }
    expect(component.style).toBe(style);
    expect(component.runtime!.styleCSS).toBe(compileBlocStyle(id, style));
    const read = await admitCollectionReleaseJson(artifact.canonicalJson, []);
    expect(read.canonicalJson).toBe(artifact.canonicalJson);
    expect(read.digest).toBe(artifact.digest);
    source.blocs[0].runtime = { styleCSS: compileBlocStyle("other--atlas--panel", style) };
    expect(() => parseCollectionRelease(source)).toThrow(/canonical compilation/);
    source.blocs[0].runtime = { styleCSS: component.runtime!.styleCSS };
    expect(() => parseCollectionRelease(source)).not.toThrow();
});

test.each([
    "color: #fff",
    "background: red",
    "box-shadow: 0 0 1px rgb(0 0 0)",
    `--${id}-tone: #fff`,
    "--foreign-tone: transparent",
    "--atlas-dofficial--atlas--accent: transparent",
    "transform: translateX(var(--foreign-offset, 0px))",
])("applies color and variable ownership validation inside keyframes: %s", (declaration) => {
    expect(() => parseCollectionRelease(colorCollection(`@keyframes fade { to { ${declaration}; } }`))).toThrow(
        /theme token|CSS variable/,
    );
});

test("allows theme-token paint and dynamic geometry inside keyframes", () => {
    const source = colorCollection(`@keyframes fade {
        from { color: var(--atlas-dofficial--atlas--accent); transform: translateX(var(--${id}-offset, 0px)); }
        to { color: currentColor; opacity: 1; }
    } :scope { animation-name: fade; animation-duration: var(--${id}-duration, 1s); }`);
    expect(() => parseCollectionRelease(source)).not.toThrow();
});

test("compiled name expansion remains subject to the collection document byte budget", () => {
    const source = colorCollection(`${frames} :scope { animation-name: ${Array(100).fill("fade").join(",")}; }`);
    const maxDocumentBytes = new TextEncoder().encode(JSON.stringify(source)).byteLength + 100;
    expect(() => parseCollectionRelease(source, { ...DEFAULT_COLLECTION_LIMITS, maxDocumentBytes })).toThrow(
        /document byte limit/,
    );
});

test.each(["animation-name: unknown", "animation-name: var(--name)", "animation: fade var(--duration)"])(
    "invalid animations leave release storage and both sites unchanged: %s",
    async (declaration) => {
        const storage = new MemoryCollectionStorage();
        const store = new CollectionStore(storage);
        const valid = await store.importRelease(colorCollection(style));
        await store.install("a", valid.digest, 0);
        await store.install("b", valid.digest, 0);
        const before = await Promise.all([storage.readSite("a"), storage.readSite("b")]);
        const writeRelease = spyOn(storage, "putRelease");
        const writeSite = spyOn(storage, "compareAndSet");
        try {
            await expect(
                store.importRelease(colorCollection(`${frames} :scope { ${declaration}; }`)),
            ).rejects.toThrow();
            expect(writeRelease).not.toHaveBeenCalled();
            expect(writeSite).not.toHaveBeenCalled();
            expect(await Promise.all([storage.readSite("a"), storage.readSite("b")])).toEqual(before);
        } finally {
            writeRelease.mockRestore();
            writeSite.mockRestore();
        }
    },
);
