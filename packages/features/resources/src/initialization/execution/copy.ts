import { readSystemSnapshot } from "@bernouy/content";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { resourceDigest } from "resources/storage/records";
import type { VerifiedResourceArchive } from "resources/interfaces/archive";
import type { ResourceCopyPorts, ResourceCopyProgress } from "../interfaces";
import type { ResourcePreviewPage } from "../schemas";
import { mergeResourceTheme } from "./theme";
import { copyResourceEntities } from "./resources";
import { copyResourcePages } from "./pages";
import { resourceInitializationError } from "../state";

/** Shared by disposable preflight and durable apply; archive data never becomes an installed view. */
export async function copyResourceContent(
    archive: VerifiedResourceArchive | null,
    ports: ResourceCopyPorts,
    guard: ResourceCopyProgress,
    expected: Readonly<{ pages: readonly ResourcePreviewPage[]; themeDigest: string }> | null,
) {
    const progress = structuredClone(guard.initial);
    await guard.assertHeld();
    const system = await readSystemSnapshot(ports.content);
    const theme = mergeResourceTheme(system.system.theme, archive?.document.theme ?? null);
    const themeDigest = resourceDigest(theme);
    if (expected && themeDigest !== expected.themeDigest) {
        throw resourceInitializationError("Resource theme no longer matches its review", 409);
    }
    if (archive) {
        await copyResourceEntities(archive, ports, progress, guard);
    }
    await guard.assertHeld();
    if (progress.theme) {
        if (resourceDigest((await ports.content.getSystem()).theme) !== themeDigest) {
            throw resourceInitializationError("Initialized theme was changed", 409);
        }
    } else {
        if (canonicalizeIJson(system.system.theme) !== canonicalizeIJson(theme)) {
            await ports.content.updateSystem({ theme }, system.revision);
        }
        progress.theme = true;
        await guard.assertHeld();
        await guard.checkpoint(progress);
    }
    const pages = await copyResourcePages(
        archive?.document.pages ?? [],
        ports,
        progress,
        guard,
        expected?.pages ?? null,
    );
    return { pages, themeDigest, progress };
}
