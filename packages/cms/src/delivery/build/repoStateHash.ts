import type { TPage } from "src/socle/interfaces/models";
import type { DeliveryRepository } from "src/delivery/interfaces/DeliveryRepository";
import { sha256Hex } from "src/delivery/build/sha256";

/**
 * Cheap fingerprint of the repository state used to short-circuit `runOnce`
 * when nothing has changed since the last deploy. Hashes the inputs that
 * actually affect the rendered output: every page (path + title +
 * description + content + visible flag), every snippet (expanded into
 * pages at render time, so a content change must trigger rebuild), and
 * the system settings.
 *
 * Intentionally NOT cryptographically meaningful — collisions would just
 * cause a missed deploy, which is acceptable given the alternative is
 * re-rendering every page on every poll cycle.
 */
export async function computeRepoStateHash(
    repository: DeliveryRepository,
    pages: readonly TPage[],
): Promise<string> {
    const sortedPages = [...pages].sort((a, b) => a.path.localeCompare(b.path));
    const pagesPayload = sortedPages.map(p => [
        p.path, p.title, p.description, p.content, p.visible, p.tags,
    ]);

    const snippets = await repository.getAllSnippets();
    const sortedSnippets = [...snippets].sort((a, b) => a.identifier.localeCompare(b.identifier));
    const snippetsPayload = sortedSnippets.map(s => [s.identifier, s.content]);

    const system = await repository.getSystem();

    return sha256Hex(JSON.stringify([pagesPayload, snippetsPayload, system]));
}
