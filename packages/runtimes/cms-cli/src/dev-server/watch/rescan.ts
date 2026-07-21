import type { BuiltBloc } from "../build/index";
import { buildDevBloc } from "../build/index";
import { scanDevBlocs } from "../scan";
import { folderMaxMtimeMs, triggerRebuild } from "./rebuild";
import type { RegistryEntry, ReloadEmitter } from "./types";

type RescanContext = {
    cwd: string;
    entries: Map<string, RegistryEntry>;
    built: Map<string, BuiltBloc>;
    emitter: ReloadEmitter;
    warnedCollisions: Set<string>;
    addEntry: (bloc: RegistryEntry["bloc"], initialMtimeMs?: number) => void;
    removeEntry: (folder: string) => void;
};

export async function rescanRegistry(context: RescanContext): Promise<void> {
    const fresh = await scanDevBlocs(context.cwd, { quiet: true });
    const freshByFolder = new Map(fresh.map((bloc) => [bloc.folder, bloc]));
    removeMissingEntries(context, freshByFolder);

    for (const [folder, bloc] of freshByFolder) {
        const existing = context.entries.get(folder);
        if (!existing) {
            await addNewEntry(context, folder, bloc);
            continue;
        }

        const old = existing.bloc;
        const metadataUnchanged = old.tag === bloc.tag && old.label === bloc.label && old.group === bloc.group;
        if (metadataUnchanged) {
            const maxMtime = await folderMaxMtimeMs(bloc.folder);
            if (maxMtime > existing.lastBuildMtimeMs && !existing.building) {
                console.log(`[poll] ${bloc.tag} source changed — rebuilding (fs.watch miss)`);
                triggerRebuild(existing, context.built, context.emitter);
            }
            continue;
        }

        try {
            const rebuilt = await buildDevBloc(bloc);
            if (old.tag !== bloc.tag) {
                context.built.delete(old.tag);
            }
            context.built.set(rebuilt.tag, rebuilt);
            existing.bloc = bloc;
            const arrow = old.tag !== bloc.tag ? ` → ${bloc.tag}` : "";
            console.log(`[rescan] Updated ${old.tag}${arrow}`);
            if (old.tag !== bloc.tag) {
                context.emitter.emit(old.tag);
            }
            context.emitter.emit(rebuilt.tag);
        } catch (error) {
            console.error(`[rescan] Failed to rebuild ${old.tag}: ${error instanceof Error ? error.message : error}`);
        }
    }
}

function removeMissingEntries(context: RescanContext, freshByFolder: Map<string, RegistryEntry["bloc"]>): void {
    for (const folder of [...context.entries.keys()]) {
        if (freshByFolder.has(folder)) {
            continue;
        }
        const tag = context.entries.get(folder)!.bloc.tag;
        context.removeEntry(folder);
        context.built.delete(tag);
        console.log(`[rescan] Removed ${tag} (${folder})`);
        context.emitter.emit(tag);
    }
    for (const folder of [...context.warnedCollisions]) {
        if (!freshByFolder.has(folder)) {
            context.warnedCollisions.delete(folder);
        }
    }
}

async function addNewEntry(context: RescanContext, folder: string, bloc: RegistryEntry["bloc"]): Promise<void> {
    const collision = [...context.entries.values()].find((entry) => entry.bloc.tag === bloc.tag);
    if (collision) {
        if (!context.warnedCollisions.has(folder)) {
            context.warnedCollisions.add(folder);
            console.warn(`[rescan] Skipping ${folder}: tag "${bloc.tag}" is already used by ${collision.bloc.folder}`);
        }
        return;
    }

    context.warnedCollisions.delete(folder);
    try {
        const built = await buildDevBloc(bloc);
        context.built.set(built.tag, built);
        context.addEntry(bloc);
        console.log(`[rescan] Added ${built.tag} (${folder})`);
        context.emitter.emit(built.tag);
    } catch (error) {
        console.error(
            `[rescan] Failed to build new bloc at ${folder}: ${error instanceof Error ? error.message : error}`,
        );
    }
}
