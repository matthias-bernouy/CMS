import { access } from "node:fs/promises";
import { join } from "node:path";
import { requireExecutable, runCommand } from "./process";

export const SUPABASE_CLI_VERSION = "2.116.0";

export type LocalSupabaseStatus = Readonly<{
    apiUrl?: string;
    studioUrl?: string;
}>;

export async function startLocalSupabase(projectRoot: string): Promise<void> {
    requireExecutable("bunx");
    if (!(await exists(join(projectRoot, "supabase", "config.toml")))) {
        await requiredSupabaseCommand(projectRoot, ["init"]);
    }
    await requiredSupabaseCommand(projectRoot, ["start"]);
}

export async function localSupabaseStatus(projectRoot: string): Promise<LocalSupabaseStatus | null> {
    requireExecutable("bunx");
    const result = await runSupabase(projectRoot, ["status", "--output", "json"]);
    return result.exitCode === 0 ? safeStatus(result.stdout) : null;
}

export async function stopLocalSupabase(projectRoot: string): Promise<boolean> {
    requireExecutable("bunx");
    const result = await runSupabase(projectRoot, ["stop"]);
    return result.exitCode === 0;
}

async function requiredSupabaseCommand(projectRoot: string, args: readonly string[]): Promise<void> {
    const result = await runSupabase(projectRoot, args);
    if (result.exitCode !== 0) {
        throw new Error(`Supabase CLI ${args[0]} failed with exit code ${result.exitCode}`);
    }
}

async function runSupabase(projectRoot: string, args: readonly string[]) {
    return await runCommand(["bunx", `supabase@${SUPABASE_CLI_VERSION}`, "--workdir", projectRoot, "--yes", ...args], {
        allowFailure: true,
    });
}

async function exists(path: string): Promise<boolean> {
    return await access(path).then(
        () => true,
        () => false,
    );
}

function safeStatus(output: string): LocalSupabaseStatus {
    try {
        const value = JSON.parse(output) as Record<string, unknown>;
        const apiUrl = localHttpUrl(value.API_URL);
        const studioUrl = localHttpUrl(value.STUDIO_URL);
        return { ...(apiUrl ? { apiUrl } : {}), ...(studioUrl ? { studioUrl } : {}) };
    } catch {
        return {};
    }
}

function localHttpUrl(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost")
        ? url.href.replace(/\/$/u, "")
        : undefined;
}
