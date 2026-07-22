import { LocalFsCmsFiles } from "@bernouy/cms-files";

export async function reconcileLocalFiles(files: LocalFsCmsFiles): Promise<void> {
    const result = await files.reconcile();
    if (result.healed.length) {
        console.log(`→ Reconciled ${result.healed.length} moved file(s).`);
    }
    if (result.minted.length) {
        console.log(`→ Minted ids for ${result.minted.length} new file(s)/folder(s).`);
    }
    if (result.deleted.length) {
        console.log(`→ Dropped ${result.deleted.length} orphaned registry entry/entries.`);
    }
    for (const error of result.errors) {
        console.warn(`  ! ${error.path}: ${error.error}`);
    }
}
