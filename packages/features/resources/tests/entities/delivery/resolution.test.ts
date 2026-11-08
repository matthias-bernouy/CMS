import { expect, test } from "bun:test";
import { resolveResourceAssetSources, resolveResourceAssets } from "../../../src/exports/delivery";
import { fixture } from "./fixtures";

test("asset expressions batch distinct scoped metadata without loading bodies, and retain unrelated bindings", async () => {
    const f = await fixture();
    const ref = "{{ cms.asset.acme/base.files/test.txt }}";
    const css = `url('${ref}') ${ref} {{ state.label }} {{ cms.i18n.acme/base.title }}`;
    const pending = resolveResourceAssetSources([css, ref, css], f.assets);
    const result = await pending;
    expect(result.get(css)).toBe(`url('${f.url}') ${f.url} {{ state.label }} {{ cms.i18n.acme/base.title }}`);
    expect(result.get(ref)).toBe(f.url);
    expect(f.metadata.reads).toBe(1);
    expect(f.metadata.loaded).toBe(1);
    expect(f.blobs.reads).toHaveLength(0);
    expect(f.blobs.heads).toBe(0);
    expect(await resolveResourceAssets("plain {{ state.value }}", f.assets)).toBe("plain {{ state.value }}");
    expect(f.metadata.reads).toBe(1);
});
test("unknown, invalid and oversized static references refuse without mutation or byte reads", async () => {
    const f = await fixture();
    await expect(resolveResourceAssets("{{ cms.asset.acme/base.missing.txt }}", f.assets)).rejects.toThrow(
        "Unknown resource",
    );
    await expect(resolveResourceAssets("{{ cms.asset.invalid }}", f.assets)).rejects.toThrow("Invalid static");
    await expect(resolveResourceAssetSources(Array(513).fill("plain"), f.assets)).rejects.toThrow("Too many");
    await expect(resolveResourceAssets("a".repeat(1024 * 1024 + 1), f.assets)).rejects.toThrow("budget");
    expect(f.blobs.reads).toHaveLength(0);
    expect((await f.assets.getMetadata([{ namespace: f.asset.namespace, id: f.asset.id }]))[0]).toEqual(f.asset);
});
