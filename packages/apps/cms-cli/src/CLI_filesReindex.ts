import { LocalFsCmsFiles } from "@bernouy/cms-shared";
import { loadPushConfig } from "./push/shared/config";

/**
 * `p9r files reindex` — the explicit, on-demand reconcile of the media tree.
 * Scans `<siteDir>/files/`, heals files moved/renamed directly in the IDE by
 * content hash, mints ids for new files, drops orphans, then commits one atomic
 * registry snapshot. `--force` is the only way past an unparseable existing
 * registry (it rebuilds from disk). Run before pushing, then commit the
 * registry — committed ids never change for a given path+content.
 *
 * Do NOT run this while `p9r dev` is up: both processes would write the same
 * registry and the second writer would clobber the first's in-memory state.
 */
export default async function CLI_filesReindex(args: string[]): Promise<void> {
    const sub = args[0];
    if (sub !== "reindex") {
        console.error(`Unknown files subcommand: ${sub ?? "(none)"}\n  Usage: p9r files reindex [--force]`);
        process.exit(1);
    }
    const force = args.includes("--force") || args.includes("-f");

    const config = await loadPushConfig(process.cwd());
    const root = `${config.siteDir}/files`;
    const files = new LocalFsCmsFiles(root);

    if (force) await rmRegistry(`${config.siteDir}/.cms-files-registry.json`);

    const r = await files.reconcile();
    console.log(`→ Reindexed ${config.siteDir}/files`);
    console.log(`    healed  ${r.healed.length}   minted ${r.minted.length}   dropped ${r.deleted.length}`);
    for (const e of r.errors) console.warn(`  ! ${e.path}: ${e.error}`);
    console.log("→ Commit .cms-files-registry.json — committed ids never change for a given path+content.");
    if (r.errors.length) process.exit(1);
}

/** `--force`: discard an existing (possibly corrupt) registry so reconcile rebuilds from disk. */
async function rmRegistry(path: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    await unlink(path).catch(() => {});
}
