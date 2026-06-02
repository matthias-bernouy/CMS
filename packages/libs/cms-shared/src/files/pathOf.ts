import type { CmsFilesMetadataRepository } from "cms-shared/interfaces/CmsFilesMetadataRepository";

/**
 * Reverse of `getItemByPath`: reconstruct an item's readable tree-path
 * ("logos/hero.png") by walking the `parentId` chain to the root and joining
 * names. Returns `null` when `id` is unknown. O(depth) sequential `getItem`s —
 * fine for the shallow trees the admin builds; batch if it ever fans out.
 */
export async function pathOf(metadata: CmsFilesMetadataRepository, id: string): Promise<string | null> {
    const names: string[] = [];
    let cur = await metadata.getItem(id);
    if (!cur) return null;
    while (cur) {
        names.unshift(cur.name);
        cur = cur.parentId ? await metadata.getItem(cur.parentId) : null;
    }
    return names.join("/");
}
