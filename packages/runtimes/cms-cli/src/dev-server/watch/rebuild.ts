import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import type { BuiltBloc } from "../build/index";
import { buildDevBloc } from "../build/index";
import { scanDevBlocs } from "../scan";
import type { RegistryEntry, ReloadEmitter } from "./types";

const IGNORED = /(?:^|[\\/])(?:\.__p9r_dev_|\.p9r-dev[\\/]|node_modules[\\/])/;

export async function folderMaxMtimeMs(folder: string): Promise<number> {
    let entries: string[];
    try {
        entries = await readdir(folder);
    } catch {
        return 0;
    }

    let max = 0;
    for (const name of entries) {
        if (name.startsWith(".__p9r_dev_") || name.startsWith(".")) {
            continue;
        }
        try {
            const metadata = await stat(`${folder}/${name}`);
            if (metadata.isFile() && metadata.mtimeMs > max) {
                max = metadata.mtimeMs;
            }
        } catch {}
    }
    return max;
}

export async function triggerRebuild(
    entry: RegistryEntry,
    built: Map<string, BuiltBloc>,
    emitter: ReloadEmitter,
): Promise<void> {
    if (entry.building) {
        entry.pending = true;
        return;
    }
    entry.building = true;
    try {
        const oldTag = entry.bloc.tag;
        const freshBloc = (await rescanBlocFolder(entry.bloc.folder)) ?? entry.bloc;
        const rebuilt = await buildDevBloc(freshBloc);
        if (rebuilt.tag !== oldTag) {
            built.delete(oldTag);
        }
        built.set(rebuilt.tag, rebuilt);
        entry.bloc = freshBloc;
        entry.lastBuildMtimeMs = await folderMaxMtimeMs(entry.bloc.folder);
        console.log(`[watch] Rebuilt ${rebuilt.tag}`);
        if (rebuilt.tag !== oldTag) {
            emitter.emit(oldTag);
        }
        emitter.emit(rebuilt.tag);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("ENOENT")) {
            console.error(`[watch] ${entry.bloc.tag}: ${message}`);
        }
    } finally {
        entry.building = false;
        if (entry.pending) {
            entry.pending = false;
            setTimeout(() => triggerRebuild(entry, built, emitter), 10);
        }
    }
}

export function makeWatcher(entry: RegistryEntry, built: Map<string, BuiltBloc>, emitter: ReloadEmitter): FSWatcher {
    const onChange = (_type: string, filename: string | null) => {
        if (filename && IGNORED.test(filename)) {
            return;
        }
        if (entry.rebuildTimer) {
            clearTimeout(entry.rebuildTimer);
        }
        entry.rebuildTimer = setTimeout(() => triggerRebuild(entry, built, emitter), 150);
    };
    return watch(entry.bloc.folder, onChange);
}

async function rescanBlocFolder(folder: string) {
    const blocs = await scanDevBlocs(folder, { quiet: true });
    return blocs.find((bloc) => bloc.folder === folder) ?? null;
}
