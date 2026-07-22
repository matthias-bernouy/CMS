import type { FSWatcher } from "node:fs";
import type { DevBloc } from "../scan";

export type ReloadEmitter = {
    subscribe: (listener: (tag: string) => void) => () => void;
    emit: (tag: string) => void;
};

export type RegistryHandle = {
    stop: () => void;
};

export type RegistryEntry = {
    bloc: DevBloc;
    watcher: FSWatcher;
    rebuildTimer: ReturnType<typeof setTimeout> | null;
    building: boolean;
    pending: boolean;
    lastBuildMtimeMs: number;
};
