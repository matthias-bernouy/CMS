import { readFile } from "node:fs/promises";

import type { OriginProvider } from "../../exports/OriginProvider";
import type { Edge } from "../../interfaces/entities/Edge";

export type OriginStatus = {
    edges: ReadonlyArray<Edge>;
    lsyncd: {
        configPath:    string;
        statusPath:    string;
        statusPresent: boolean;
        statusMtimeMs: number | null;
        statusExcerpt: string | null;
    } | null;
    sshPubkey: string | null;
};

/**
 * Aggregate everything the operator wants on the origin dashboard:
 *  - the edge list (with their last probe outcomes already attached),
 *  - lsyncd status file metadata + a tail of its content (best-effort),
 *  - the origin's SSH public key so the operator can copy it to a fresh
 *    edge server without shelling into the container.
 *
 * Each piece is best-effort: a missing file or a permission error
 * degrades to `null` rather than failing the whole call.
 */
export async function getOriginStatus(provider: OriginProvider): Promise<OriginStatus> {
    const edges = await provider.edgeRepo.list();

    const lsyncd = provider.config.lsyncd
        ? await collectLsyncdStatus(provider.config.lsyncd.statusPath, provider.config.lsyncd.configPath)
        : null;

    const sshPubkey = provider.config.probe
        ? await readBestEffort(provider.config.probe.sshKeyPath + ".pub")
        : null;

    return { edges, lsyncd, sshPubkey };
}

async function collectLsyncdStatus(statusPath: string, configPath: string): Promise<OriginStatus["lsyncd"]> {
    let statusPresent = false;
    let statusMtimeMs: number | null = null;
    let statusExcerpt: string | null = null;
    try {
        const file = Bun.file(statusPath);
        statusPresent = await file.exists();
        if (statusPresent) {
            statusMtimeMs = file.lastModified;
            const text = await file.text();
            statusExcerpt = text.slice(0, 4096);
        }
    } catch {
        statusPresent = false;
    }
    return { configPath, statusPath, statusPresent, statusMtimeMs, statusExcerpt };
}

async function readBestEffort(path: string): Promise<string | null> {
    try {
        const content = await readFile(path, { encoding: "utf-8" });
        return content.trim();
    } catch {
        return null;
    }
}
