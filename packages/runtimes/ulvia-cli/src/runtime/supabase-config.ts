import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const LOCAL_SUPABASE_MAILPIT_URL = "http://127.0.0.1:54324";
export const LOCAL_SUPABASE_SMTP_HOST = "127.0.0.1";
export const LOCAL_SUPABASE_SMTP_PORT = 54325;

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
    await writePrivateChange(path, source, updated);
}

export async function ensureLocalSupabaseSmtpExposure(projectRoot: string, configPath?: string): Promise<void> {
    const path = configPath ?? join(projectRoot, "supabase", "config.toml");
    const source = await readFile(path, "utf8");
    const updated = source.replace(
        /^([ \t]*)#?[ \t]*smtp_port[ \t]*=[ \t]*[0-9]+[ \t]*$/mu,
        `$1smtp_port = ${LOCAL_SUPABASE_SMTP_PORT}`,
    );
    await writePrivateChange(path, source, updated);
}

async function writePrivateChange(path: string, source: string, updated: string): Promise<void> {
    if (updated === source) {
        return;
    }
    await writeFile(path, updated, { mode: 0o600 });
    await chmod(path, 0o600);
}
