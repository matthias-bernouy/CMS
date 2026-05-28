import type { ControlCms } from "src/control/ControlCms";
import InvalidParam from "src/control/errors/Http/InvalidParam";
import { extractRefs } from "src/socle/utils/contentRefs";

/**
 * Reject content that references a bloc tag or snippet identifier missing
 * from the repository. The CLI does the same check pre-push; this is the
 * server-side gate that catches saves from the admin UI, direct API calls
 * and any other client. Strict by design — no escape hatch.
 *
 * Skipped on empty content (no refs to verify). Two repository round-trips
 * at most: the bloc list and the snippet metadata, each fetched only when
 * the content actually contains refs of that kind.
 */
export async function assertContentRefsExist(cms: ControlCms, content: string): Promise<void> {
    if (!content) return;

    const { blocs, snippets } = extractRefs(content);
    if (blocs.size === 0 && snippets.size === 0) return;

    const missing: string[] = [];

    if (blocs.size > 0) {
        const known = new Set((await cms.repository.getBlocsList()).map(b => b.id));
        for (const tag of blocs) if (!known.has(tag)) missing.push(`bloc "${tag}"`);
    }

    if (snippets.size > 0) {
        const known = new Set((await cms.repository.getSnippetsMetadata()).map(s => s.identifier));
        for (const id of snippets) if (!known.has(id)) missing.push(`snippet "${id}"`);
    }

    if (missing.length > 0) {
        throw new InvalidParam("content", `unknown reference(s): ${missing.join(", ")}`);
    }
}
