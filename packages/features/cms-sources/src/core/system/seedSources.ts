import type { SourceRepository } from "cms-sources/interfaces/SourceRepository";
import type { Source } from "cms-sources/interfaces/Source";
import { validateSource } from "cms-sources/core/validation/validateSource";

export type SeedResult = { created: string[]; skipped: string[] };

/**
 * Loads a source manifest into the repo. **Idempotent**: if the urn
 * already exists it is skipped (no update — the repo does not yet have
 * `update`/`delete`, so editing an already-stored source requires a wipe).
 *
 * Two passes:
 *   1. validate the ENTIRE manifest (`validateSource` + unique urns) and throw
 *      **before** touching the store if anything is wrong (fail fast,
 *      no partial seed);
 *   2. create, skipping sources that are already present.
 *
 * Uses only the `SourceRepository` INTERFACE (injection) — no impl.
 */
export async function seedSources(repo: SourceRepository, sources: Source[]): Promise<SeedResult> {
    // 1) Validation — nothing created if the manifest is invalid.
    const problems: string[] = [];

    const urns = sources.map((p) => p.urn);
    const dupes = [...new Set(urns.filter((u, i) => urns.indexOf(u) !== i))];
    if (dupes.length > 0) {
        problems.push(`duplicate source urns: ${dupes.join(", ")}`);
    }

    for (const source of sources) {
        const errors = validateSource(source);
        if (errors.length > 0) {
            problems.push(`"${source.urn}" : ${errors.join(" ; ")}`);
        }
    }

    if (problems.length > 0) {
        throw new Error(`Invalid source manifest:\n  - ${problems.join("\n  - ")}`);
    }

    // 2) Idempotent creation (skip-if-exists).
    const created: string[] = [];
    const skipped: string[] = [];
    for (const source of sources) {
        if (await repo.getSource(source.urn)) {
            skipped.push(source.urn);
            continue;
        }
        await repo.createSource(source);
        created.push(source.urn);
    }

    return { created, skipped };
}
