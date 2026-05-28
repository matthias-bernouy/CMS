import { isValidCategoryFolder } from "src/socle/utils/validation";

/**
 * Snippets and templates carry a `category` whose value is the parent
 * folder name on disk. When the category is empty, files live under
 * `_uncategorized/` so every entity always has exactly one canonical
 * filesystem location (no flat-vs-nested ambiguity).
 */
export const UNCATEGORIZED_FOLDER = "_uncategorized";

export function folderToCategory(folder: string): string {
    return folder === UNCATEGORIZED_FOLDER ? "" : folder;
}

/**
 * Reverse mapping. Throws when the category contains a path separator —
 * those values can't be encoded as a single filesystem segment, so the
 * caller (pull) surfaces a per-entity error and the user fixes it from
 * the admin UI before the next pull.
 */
export function categoryToFolder(category: string): string {
    if (!category) return UNCATEGORIZED_FOLDER;
    if (!isValidCategoryFolder(category)) {
        throw new Error(
            `Category "${category}" can't be used as a folder name — ` +
            `rename it from the admin UI (no "/", "\\" or hidden-folder names).`,
        );
    }
    return category;
}
