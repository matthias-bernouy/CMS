import { join, relative } from "node:path";
import { scanDevBlocs, type DevBloc } from "cms-cli/dev-server/scan";
import { buildAllDevBlocs } from "cms-cli/dev-server/build";
import { loadPushConfig } from "cms-cli/push/shared/config";
import { confirm } from "cms-cli/push/shared/recap";
import { applyPushBlocs, fetchRemoteBlocList } from "cms-cli/push/blocs/apply";

export type RunBlocsFlags = {
    force: boolean;
    yes: boolean;
    dryRun: boolean;
    only?: Set<string> | null;
};

export async function runBlocs(
    adminBase: URL,
    token:     string,
    flags:     RunBlocsFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const force  = flags.force || config.forcePushDefault;
    const root   = join(config.siteDir, "blocs");

    console.log(`→ Site dir : ${config.siteDir}`);
    if (flags.dryRun) console.log(`→ Mode     : dry-run (no upload)`);
    if (force)        console.log(`→ Force    : existing blocs will be overwritten`);
    if (flags.only)   console.log(`→ Filter   : --only=${[...flags.only].join(",")}`);

    const remoteTags = new Set((await fetchRemoteBlocList(adminBase, token)).map(b => b.id));
    const blocs = await scanDevBlocs(root);
    if (blocs.length === 0) {
        console.log("→ No blocs found under <siteDir>/blocs/. Skipping.");
        return 0;
    }

    const candidates = flags.only
        ? blocs.filter(b => flags.only!.has(b.tag))
        : blocs;

    if (flags.only && candidates.length === 0) {
        console.error("✖ --only matched no blocs.");
        console.error(`  Requested: ${[...flags.only].join(", ")}`);
        console.error(`  Available: ${blocs.map(b => b.tag).join(", ")}`);
        return 1;
    }

    printFound(config.siteDir, candidates);

    const fresh: DevBloc[] = [];
    const existing: DevBloc[] = [];
    for (const bloc of candidates) {
        if (remoteTags.has(bloc.tag)) existing.push(bloc);
        else                          fresh.push(bloc);
    }

    if (existing.length > 0) {
        console.warn("");
        if (force) {
            console.warn(`⚠ ${existing.length} bloc(s) already exist on the remote and will be overwritten:`);
        } else {
            console.warn(`⚠ ${existing.length} bloc(s) already exist on the remote and will be skipped:`);
        }
        for (const bloc of existing) console.warn(`    • ${bloc.tag}  (${relative(config.siteDir, bloc.folder) || "."})`);
    }

    const toBuild = force ? candidates : fresh;
    if (toBuild.length === 0) {
        console.log("");
        console.log("→ No bloc changes.");
        return 0;
    }

    console.log("");
    console.log(`→ Building ${toBuild.length} bloc(s)...`);
    const built = await buildAllDevBlocs(toBuild);
    const buildFailures = toBuild.length - built.size;
    if (built.size === 0) {
        console.error("✖ All bloc builds failed. See errors above.");
        return 1;
    }
    if (buildFailures > 0) console.warn(`⚠ ${buildFailures} bloc(s) failed to build. See errors above.`);

    if (flags.dryRun) {
        console.log("");
        console.log(`→ Dry-run — would push ${built.size} bloc(s):`);
        for (const [tag, bloc] of built) {
            const viewKb   = (bloc.viewJS.length / 1024).toFixed(1);
            const editorKb = bloc.editorJS ? `${(bloc.editorJS.length / 1024).toFixed(1)}kb` : "-";
            console.log(`    • ${tag.padEnd(28)} view=${viewKb}kb  editor=${editorKb}`);
        }
        return buildFailures > 0 ? 1 : 0;
    }

    if (!await confirm(`\nPush ${built.size} bloc(s)?`, flags.yes)) {
        console.log("→ Aborted.");
        return 0;
    }

    const result = await applyPushBlocs(adminBase, token, built, force);
    for (const { tag, error } of result.failed) console.error(`    ✗ ${tag}: ${error}`);
    for (const { tag }        of result.pushed) console.log  (`    ✓ ${tag}`);

    const failed = result.failed.length + buildFailures;
    console.log(`\n→ Done. ${result.pushed.length} pushed, ${existing.length - (force ? existing.length : 0)} skipped, ${failed} failed.`);
    return failed > 0 ? 1 : 0;
}

function printFound(siteDir: string, blocs: DevBloc[]): void {
    console.log(`→ Found ${blocs.length} bloc(s):`);
    for (const bloc of blocs) {
        const rel = relative(siteDir, bloc.folder) || ".";
        const opaque = bloc.editorEntry ? "" : "  (opaque)";
        console.log(`    • ${bloc.tag.padEnd(28)} ${bloc.label}  —  ${rel}${opaque}`);
    }
}
