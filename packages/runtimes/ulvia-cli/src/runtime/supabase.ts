import { createHash } from "node:crypto";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { requireExecutable, runCommand } from "./process";

export const SUPABASE_CLI_VERSION = "2.116.0";

export type LocalSupabaseStatus = Readonly<{
    apiUrl?: string;
    studioUrl?: string;
}>;

export type LocalSupabaseEnvironment = Readonly<{
    apiUrl: string;
    functionsUrl: string;
    databaseUrl: string;
    publishableKey?: string;
    secretKey?: string;
}>;

export async function initializeLocalSupabase(projectRoot: string): Promise<void> {
    requireExecutable("bunx");
    const configPath = join(projectRoot, "supabase", "config.toml");
    if (!(await exists(configPath))) {
        await requiredSupabaseCommand(projectRoot, ["init"]);
    }
    await ensureLocalSupabaseProjectIdentity(projectRoot, configPath);
    // Supabase Studio bind-mounts this path. Creating it first prevents Docker
    // from leaving a root-owned directory in the persistent local workspace.
    await mkdir(join(projectRoot, "supabase", "snippets"), { recursive: true, mode: 0o700 });
}

export function localSupabaseProjectId(projectRoot: string): string {
    const suffix = createHash("sha256").update(resolve(projectRoot)).digest("hex").slice(0, 12);
    return `ulvia-dev-${suffix}`;
}

export async function ensureLocalSupabaseProjectIdentity(projectRoot: string, configPath?: string): Promise<void> {
    const path = configPath ?? join(projectRoot, "supabase", "config.toml");
    const source = await readFile(path, "utf8");
    const updated = source.replace(
        /^project_id\s*=\s*"supabase"\s*$/mu,
        `project_id = "${localSupabaseProjectId(projectRoot)}"`,
    );
    if (updated === source) {
        return;
    }
    await writeFile(path, updated, { mode: 0o600 });
    await chmod(path, 0o600);
}

export async function startLocalSupabase(
    projectRoot: string,
    options: Readonly<{ exclude?: readonly string[] }> = {},
): Promise<LocalSupabaseEnvironment> {
    await initializeLocalSupabase(projectRoot);
    const excluded = options.exclude?.length ? ["--exclude", options.exclude.join(",")] : [];
    await requiredSupabaseCommand(projectRoot, ["start", ...excluded]);
    const environment = await readLocalSupabaseEnvironment(projectRoot);
    if (!environment) {
        throw new Error("Supabase started without reporting its local service endpoints");
    }
    return environment;
}

export async function localSupabaseStatus(projectRoot: string): Promise<LocalSupabaseStatus | null> {
    requireExecutable("bunx");
    const result = await runSupabase(projectRoot, ["status", "--output", "json"]);
    return result.exitCode === 0 ? safeStatus(result.stdout) : null;
}

async function readLocalSupabaseEnvironment(projectRoot: string): Promise<LocalSupabaseEnvironment | null> {
    const result = await runSupabase(projectRoot, ["status", "--output", "json"]);
    if (result.exitCode !== 0) {
        return null;
    }
    return parseLocalSupabaseEnvironment(result.stdout);
}

export function parseLocalSupabaseEnvironment(output: string): LocalSupabaseEnvironment | null {
    const value = parseStatusOutput(output);
    const apiUrl = localHttpUrl(value?.API_URL);
    const functionsUrl = localHttpUrl(value?.FUNCTIONS_URL) ?? (apiUrl ? `${apiUrl}/functions/v1` : undefined);
    const databaseUrl = localDatabaseUrl(value?.DB_URL);
    const publishableKey = localCredential(value?.PUBLISHABLE_KEY ?? value?.ANON_KEY);
    const secretKey = localCredential(value?.SECRET_KEY ?? value?.SERVICE_ROLE_KEY);
    return apiUrl && functionsUrl && databaseUrl
        ? {
              apiUrl,
              functionsUrl,
              databaseUrl,
              ...(publishableKey ? { publishableKey } : {}),
              ...(secretKey ? { secretKey } : {}),
          }
        : null;
}

export async function stopLocalSupabase(
    projectRoot: string,
    options: Readonly<{ destroy?: boolean }> = {},
): Promise<boolean> {
    requireExecutable("bunx");
    const result = await runSupabase(projectRoot, ["stop", ...(options.destroy ? ["--no-backup"] : [])]);
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
    const value = parseStatusOutput(output);
    const apiUrl = localHttpUrl(value?.API_URL);
    const studioUrl = localHttpUrl(value?.STUDIO_URL);
    return { ...(apiUrl ? { apiUrl } : {}), ...(studioUrl ? { studioUrl } : {}) };
}

function parseStatusOutput(output: string): Record<string, unknown> | undefined {
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start < 0 || end <= start) {
        return undefined;
    }
    try {
        return JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
        return undefined;
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

function localDatabaseUrl(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const url = new URL(value);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost")
        ? url.href
        : undefined;
}

function localCredential(value: unknown): string | undefined {
    return typeof value === "string" && value.length >= 16 ? value : undefined;
}
