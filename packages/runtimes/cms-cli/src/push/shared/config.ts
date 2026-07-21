import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export type PushConfig = {
    /** Absolute path to the site/ folder. */
    siteDir: string;
    /** When true, `push` does not protect the remote — `--force` becomes the default. */
    forcePushDefault: boolean;
};

const DEFAULT_SITE_DIR = "site";
const CONFIG_FILE = "p9r.config.json";

type RawConfig = {
    siteDir?: unknown;
    forcePushDefault?: unknown;
};

/**
 * Resolve push config for the given cwd. Reads `p9r.config.json` if present,
 * otherwise falls back to `./site/`. Missing fields keep their defaults.
 */
export async function loadPushConfig(cwd: string): Promise<PushConfig> {
    const configPath = join(cwd, CONFIG_FILE);
    const raw = existsSync(configPath) ? await readRaw(configPath) : {};

    const siteDirRaw = typeof raw.siteDir === "string" && raw.siteDir.trim() ? raw.siteDir.trim() : DEFAULT_SITE_DIR;

    return {
        siteDir: isAbsolute(siteDirRaw) ? siteDirRaw : resolve(cwd, siteDirRaw),
        forcePushDefault: raw.forcePushDefault === true,
    };
}

async function readRaw(path: string): Promise<RawConfig> {
    try {
        return JSON.parse(await readFile(path, "utf-8")) as RawConfig;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to parse ${path}: ${msg}`);
    }
}
