import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import type {
    PreparationInventoryPage,
    PreparationInventoryQuery,
} from "repository/application/authoring/interfaces/AuthoringDtos";
import { preparationInventoryInputSchema } from "repository/application/authoring/schemas/preparations/inventory";
import { RepositoryRequestError } from "repository/repository/core/errors";
import { withRepositoryWriteLock } from "repository/repository/filesystem/core/lock";
import { PREPARATION_ID, PREPARATION_LIMIT, PREPARATION_TTL_MS } from "../limits";
import { preparationMetadata } from "./metadata";

export async function listPreparations(
    root: string,
    input: PreparationInventoryQuery = {},
): Promise<PreparationInventoryPage> {
    const parsed = preparationInventoryInputSchema.safeParse(input);
    if (!parsed.success || (parsed.data.cursor && !PREPARATION_ID.test(parsed.data.cursor))) {
        throw new RepositoryRequestError("REJECTED", "Invalid preparation inventory query");
    }
    const { cursor, limit = 8 } = parsed.data;
    return withRepositoryWriteLock(root, async () => {
        const completed: { id: string; expiresAt: number }[] = [];
        let count = 0;
        let inProgress = 0;
        const now = Date.now();
        for (const entry of await readdir(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || (!PREPARATION_ID.test(entry.name) && !entry.name.startsWith("prepare-"))) {
                continue;
            }
            const info = await lstat(join(root, entry.name));
            if (!info.isDirectory()) {
                continue;
            }
            const expiresAt = info.mtimeMs + PREPARATION_TTL_MS;
            if (expiresAt >= now) {
                count++;
                if (entry.name.startsWith("prepare-")) {
                    inProgress++;
                }
            }
            if (PREPARATION_ID.test(entry.name)) {
                completed.push({ id: entry.name, expiresAt });
            }
        }
        const candidates = completed.filter(({ id }) => !cursor || id > cursor).sort((a, b) => (a.id < b.id ? -1 : 1));
        const selected = candidates.slice(0, limit);
        const items: PreparationInventoryPage["items"] = [];
        for (const entry of selected) {
            items.push(await preparationMetadata(root, entry.id, entry.expiresAt));
        }
        return {
            items,
            nextCursor: candidates.length > limit ? selected.at(-1)!.id : null,
            quota: { limit: PREPARATION_LIMIT, count, inProgress },
        };
    });
}
