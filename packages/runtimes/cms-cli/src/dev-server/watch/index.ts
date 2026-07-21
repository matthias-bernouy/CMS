import type { FSWatcher } from "node:fs";
import type { BuiltBloc } from "../build/index";
import type { DevBloc } from "../scan";
import { makeWatcher } from "./rebuild";
import { rescanRegistry } from "./rescan";
import type { RegistryEntry, RegistryHandle, ReloadEmitter } from "./types";

export type { RegistryHandle, ReloadEmitter } from "./types";

const POLL_INTERVAL_MS = 1000;

export function createReloadEmitter(): ReloadEmitter {
    const listeners = new Set<(tag: string) => void>();
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        emit(tag) {
            for (const listener of listeners) {
                try {
                    listener(tag);
                } catch (error) {
                    console.error(`[watch] listener error: ${error instanceof Error ? error.message : error}`);
                }
            }
        },
    };
}

export function createBlocRegistry(
    cwd: string,
    initial: DevBloc[],
    built: Map<string, BuiltBloc>,
    emitter: ReloadEmitter,
): RegistryHandle {
    const entries = new Map<string, RegistryEntry>();
    const warnedCollisions = new Set<string>();

    const addEntry = (bloc: DevBloc, initialMtimeMs = Date.now()) => {
        const entry: RegistryEntry = {
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
        if (!entry) {
            return;
        }
        try {
            entry.watcher.close();
        } catch {}
        if (entry.rebuildTimer) {
            clearTimeout(entry.rebuildTimer);
        }
        entries.delete(folder);
    };

    for (const bloc of initial) {
        if (built.has(bloc.tag)) {
            addEntry(bloc);
        }
    }

    let polling = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let rescanning = false;
    const rescan = async () => {
        if (rescanning) {
            return;
        }
        rescanning = true;
        try {
            await rescanRegistry({ cwd, entries, built, emitter, warnedCollisions, addEntry, removeEntry });
        } catch (error) {
            console.error(`[rescan] ${error instanceof Error ? error.message : error}`);
        } finally {
            rescanning = false;
        }
    };

    const schedulePoll = () => {
        if (!polling) {
            return;
        }
        pollTimer = setTimeout(async () => {
            await rescan();
            schedulePoll();
        }, POLL_INTERVAL_MS);
    };
    schedulePoll();

    return {
        stop() {
            polling = false;
            if (pollTimer) {
                clearTimeout(pollTimer);
            }
            for (const folder of [...entries.keys()]) {
                removeEntry(folder);
            }
        },
    };
}
