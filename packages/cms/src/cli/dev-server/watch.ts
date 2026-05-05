import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import type { DevBloc } from "./scan";
import { scanDevBlocs } from "./scan";
import type { BuiltBloc } from "./build";
import { buildDevBloc } from "./build";

export type ReloadEmitter = {
    subscribe: (fn: (tag: string) => void) => () => void;
    emit: (tag: string) => void;
};

export type RegistryHandle = {
    stop: () => void;
};

export function createReloadEmitter(): ReloadEmitter {
    const listeners = new Set<(tag: string) => void>();
    return {
        subscribe(fn) {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        },
        emit(tag) {
            for (const fn of listeners) {
                try { fn(tag); }
                catch (e) { console.error(`[watch] listener error: ${e instanceof Error ? e.message : e}`); }
            }
        },
    };
}

/**
 * Filenames the watcher must ignore. The build pipeline writes temporary
 * `.__p9r_dev_*.ts` wrapper files inside each bloc folder and removes them
 * again; without this filter every rebuild would trigger another rebuild.
 */
const IGNORED = /(?:^|[\\/])(?:\.__p9r_dev_|\.p9r-dev[\\/]|node_modules[\\/])/;

/** How often the polling loop re-scans `cwd` to catch new/renamed/deleted bloc folders. */
const POLL_INTERVAL_MS = 1000;

type Entry = {
    bloc: DevBloc;
    watcher: FSWatcher;
    rebuildTimer: ReturnType<typeof setTimeout> | null;
    building: boolean;
    pending: boolean;
    /** Max mtimeMs seen across the folder at the last successful build. Used
     *  by the polling loop as a safety net for fs.watch events that inotify
     *  drops (atomic renames, overlayfs, some editors). */
    lastBuildMtimeMs: number;
};

/** Scan a bloc folder (one level deep, skipping hidden / ignored files) and
 *  return the max mtimeMs of its regular files. Zero means the folder is
 *  empty or unreadable. */
async function folderMaxMtimeMs(folder: string): Promise<number> {
    let max = 0;
    let entries: string[];
    try { entries = await readdir(folder); }
    catch { return 0; }
    for (const name of entries) {
        if (name.startsWith(".__p9r_dev_") || name.startsWith(".")) continue;
        try {
            const s = await stat(`${folder}/${name}`);
            if (s.isFile() && s.mtimeMs > max) max = s.mtimeMs;
        } catch {}
    }
    return max;
}

/**
 * Owns the live set of dev blocs: one in-memory entry per folder, its
 * `fs.watch` handle and its rebuild debouncer. A polling loop re-runs
 * `scanDevBlocs` every second to catch folder-level changes that `fs.watch`
 * cannot (new folders, renames, deletes, copies). The `built` map is mutated
 * in place so the server picks up changes without any extra wiring.
 */
export function createBlocRegistry(
    cwd: string,
    initial: DevBloc[],
    built: Map<string, BuiltBloc>,
    emitter: ReloadEmitter,
): RegistryHandle {
    const entries = new Map<string, Entry>();
    /** Folders we've already warned about for a tag collision, so the poll loop doesn't re-log every tick. */
    const warnedCollisions = new Set<string>();

    const addEntry = (bloc: DevBloc, initialMtimeMs = Date.now()) => {
        const entry: Entry = {
            bloc,
            watcher: null as unknown as FSWatcher,
            rebuildTimer: null,
            building: false,
            pending: false,
            lastBuildMtimeMs: initialMtimeMs,
        };
        entry.watcher = makeWatcher(entry, built, emitter);
        entries.set(bloc.folder, entry);
    };

    const removeEntry = (folder: string) => {
        const entry = entries.get(folder);
        if (!entry) return;
        try { entry.watcher.close(); } catch {}
        if (entry.rebuildTimer) clearTimeout(entry.rebuildTimer);
        entries.delete(folder);
    };

    // Seed from the initial scan — only keep blocs whose first build succeeded.
    for (const bloc of initial) {
        if (built.has(bloc.tag)) addEntry(bloc);
    }

    // ── Polling loop: diff `scanDevBlocs(cwd)` against `entries` ───────
    let polling = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let rescanning = false;

    const rescan = async () => {
        if (rescanning) return;
        rescanning = true;
        try {
            const fresh = await scanDevBlocs(cwd, { quiet: true });
            const freshByFolder = new Map(fresh.map(b => [b.folder, b]));

            // Removed: folder disappeared from the scan (deleted, renamed, or
            // manifest became invalid).
            for (const folder of [...entries.keys()]) {
                if (freshByFolder.has(folder)) continue;
                const entry = entries.get(folder)!;
                const tag = entry.bloc.tag;
                removeEntry(folder);
                built.delete(tag);
                console.log(`[rescan] Removed ${tag} (${folder})`);
                emitter.emit(tag);
            }
            // Also clear collision warnings for any folder that's no longer
            // around, so if the user re-creates it later we'll warn again.
            for (const folder of [...warnedCollisions]) {
                if (!freshByFolder.has(folder)) warnedCollisions.delete(folder);
            }

            // Added or metadata-changed.
            for (const [folder, bloc] of freshByFolder) {
                const existing = entries.get(folder);

                if (!existing) {
                    // New folder. Reject if its tag collides with an already-
                    // registered bloc (e.g. user copied a bloc folder without
                    // renaming the tag in manifest.json).
                    const collision = [...entries.values()].find(e => e.bloc.tag === bloc.tag);
                    if (collision) {
                        if (!warnedCollisions.has(folder)) {
                            warnedCollisions.add(folder);
                            console.warn(`[rescan] Skipping ${folder}: tag "${bloc.tag}" is already used by ${collision.bloc.folder}`);
                        }
                        continue;
                    }
                    warnedCollisions.delete(folder);
                    try {
                        const b = await buildDevBloc(bloc);
                        built.set(b.tag, b);
                        addEntry(bloc);
                        console.log(`[rescan] Added ${b.tag} (${folder})`);
                        emitter.emit(b.tag);
                    } catch (e) {
                        console.error(`[rescan] Failed to build new bloc at ${folder}: ${e instanceof Error ? e.message : e}`);
                    }
                    continue;
                }

                // Existing folder — check if manifest metadata changed OR
                // any source file is newer than our last build (safety net
                // for fs.watch events that inotify drops).
                const old = existing.bloc;
                const metaUnchanged = old.tag === bloc.tag && old.label === bloc.label && old.group === bloc.group;
                if (metaUnchanged) {
                    const maxMtime = await folderMaxMtimeMs(bloc.folder);
                    if (maxMtime > existing.lastBuildMtimeMs && !existing.building) {
                        console.log(`[poll] ${bloc.tag} source changed — rebuilding (fs.watch miss)`);
                        triggerRebuild(existing, built, emitter);
                    }
                    continue;
                }
                try {
                    const b = await buildDevBloc(bloc);
                    if (old.tag !== bloc.tag) built.delete(old.tag);
                    built.set(b.tag, b);
                    existing.bloc = bloc;
                    const arrow = old.tag !== bloc.tag ? ` → ${bloc.tag}` : "";
                    console.log(`[rescan] Updated ${old.tag}${arrow}`);
                    if (old.tag !== bloc.tag) emitter.emit(old.tag);
                    emitter.emit(b.tag);
                } catch (e) {
                    console.error(`[rescan] Failed to rebuild ${old.tag}: ${e instanceof Error ? e.message : e}`);
                }
            }
        } catch (e) {
            console.error(`[rescan] ${e instanceof Error ? e.message : e}`);
        } finally {
            rescanning = false;
        }
    };

    const schedulePoll = () => {
        if (!polling) return;
        pollTimer = setTimeout(async () => {
            await rescan();
            schedulePoll();
        }, POLL_INTERVAL_MS);
    };
    schedulePoll();

    return {
        stop() {
            polling = false;
            if (pollTimer) clearTimeout(pollTimer);
            for (const folder of [...entries.keys()]) removeEntry(folder);
        },
    };
}

async function triggerRebuild(
    entry: Entry,
    built: Map<string, BuiltBloc>,
    emitter: ReloadEmitter,
): Promise<void> {
    if (entry.building) { entry.pending = true; return; }
    entry.building = true;
    try {
        const b = await buildDevBloc(entry.bloc);
        // The manifest tag may have changed since this watcher was set up
        // (the polling loop usually catches it first, but a fast edit can
        // race). Drop the stale tag before setting the new one.
        if (b.tag !== entry.bloc.tag) built.delete(entry.bloc.tag);
        built.set(b.tag, b);
        entry.bloc = { ...entry.bloc, tag: b.tag, label: b.label, group: b.group };
        entry.lastBuildMtimeMs = await folderMaxMtimeMs(entry.bloc.folder);
        console.log(`[watch] Rebuilt ${b.tag}`);
        emitter.emit(b.tag);
    } catch (e) {
        // Ignore the race where a rebuild fires just after the folder was
        // deleted — the polling loop removes the entry within ~1s anyway.
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("ENOENT")) {
            console.error(`[watch] ${entry.bloc.tag}: ${msg}`);
        }
    } finally {
        entry.building = false;
        if (entry.pending) {
            entry.pending = false;
            setTimeout(() => triggerRebuild(entry, built, emitter), 10);
        }
    }
}

function makeWatcher(
    entry: Entry,
    built: Map<string, BuiltBloc>,
    emitter: ReloadEmitter,
): FSWatcher {
    const onChange = (_type: string, filename: string | null) => {
        if (filename && IGNORED.test(filename)) return;
        if (entry.rebuildTimer) clearTimeout(entry.rebuildTimer);
        entry.rebuildTimer = setTimeout(() => triggerRebuild(entry, built, emitter), 150);
    };

    // `recursive: true` is only supported on macOS and Windows. Bloc folders
    // are typically flat so a shallow watch is enough. Folder-level changes
    // (rename, new sibling folder, delete) are handled by the polling loop.
    // The polling loop also stats each folder every tick as a safety net for
    // fs.watch events dropped by inotify (atomic renames on some filesystems,
    // editors that write via swap-and-rename, overlayfs layers, etc).
    return watch(entry.bloc.folder, onChange);
}
