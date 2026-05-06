import { writeFile } from "node:fs/promises";

import type { Edge } from "../../interfaces/entities/Edge";
import { generateLsyncdConfig } from "./generateConfig";

export type LsyncdReloadConfig = {
    /** Local source watched by lsyncd. */
    sourcePath: string;
    /** SSH private key used by lsyncd's rsync. */
    sshKeyPath: string;
    /** Path of the generated `.lua` config file. */
    configPath: string;
    /** Path lsyncd writes its status snapshot to. */
    statusPath: string;
    /** Path lsyncd writes its log to. */
    logPath:    string;
    /** Shell command run after writing the new config to make lsyncd pick
     *  it up. The supervisor wrapper of cdn-origin kills the running
     *  lsyncd; the wrapper's outer loop respawns it with the new config. */
    reloadCmd:  string;
};

/**
 * Regenerate the lsyncd config from the current edge list and signal
 * lsyncd to restart. Returns the rendered config so callers can log /
 * inspect it.
 */
export async function regenerateAndReloadLsyncd(
    config: LsyncdReloadConfig,
    edges: ReadonlyArray<Edge>,
): Promise<string> {
    const lua = generateLsyncdConfig({
        sourcePath: config.sourcePath,
        sshKeyPath: config.sshKeyPath,
        statusFile: config.statusPath,
        logFile:    config.logPath,
        edges,
    });

    await writeFile(config.configPath, lua, { encoding: "utf-8" });

    // Best-effort: signal lsyncd to restart. The supervisor wrapper
    // respawns it with the new config. If no lsyncd is running yet (first
    // boot, no edges), the kill is a no-op and the supervisor starts
    // fresh on its next loop iteration.
    const proc = Bun.spawn({
        cmd:   ["bash", "-c", config.reloadCmd],
        stdout:"pipe",
        stderr:"pipe",
    });
    await proc.exited;

    return lua;
}
