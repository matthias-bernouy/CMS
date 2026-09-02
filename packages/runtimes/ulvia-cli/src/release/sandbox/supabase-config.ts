import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeLocalSupabase } from "../../runtime/supabase";
import type { SupabaseSandboxPorts } from "./ports";

export async function prepareSandboxSupabase(projectRoot: string, ports: SupabaseSandboxPorts): Promise<string> {
    await initializeLocalSupabase(projectRoot);
    const path = join(projectRoot, "supabase", "config.toml");
    const projectRef = `ulvia-release-${randomBytes(6).toString("hex")}`;
    let source = await readFile(path, "utf8");
    source = replaceTopLevel(source, "project_id", JSON.stringify(projectRef));
    source = replaceSectionSetting(source, "api", "port", String(ports.api));
    source = replaceSectionSetting(source, "db", "port", String(ports.database));
    source = replaceSectionSetting(source, "db", "shadow_port", String(ports.shadow));
    source = replaceSectionSetting(source, "db.pooler", "port", String(ports.pooler));
    source = replaceSectionSetting(source, "studio", "port", String(ports.studio));
    source = replaceSectionSetting(source, "studio", "enabled", "false");
    source = replaceSectionSetting(source, "local_smtp", "port", String(ports.smtp));
    source = replaceSectionSetting(source, "local_smtp", "enabled", "false");
    source = replaceSectionSetting(source, "analytics", "port", String(ports.analytics));
    source = replaceSectionSetting(source, "analytics", "enabled", "false");
    source = replaceSectionSetting(source, "edge_runtime", "inspector_port", String(ports.inspector));
    source = replaceSectionSetting(source, "realtime", "enabled", "false");
    await writeFile(path, source, { mode: 0o600 });
    await chmod(path, 0o600);
    return projectRef;
}

function replaceTopLevel(source: string, key: string, value: string): string {
    const firstSection = source.search(/^\[/mu);
    const end = firstSection < 0 ? source.length : firstSection;
    const prefix = source.slice(0, end);
    const replaced = replaceSetting(prefix, key, value);
    return `${replaced}${source.slice(end)}`;
}

function replaceSectionSetting(source: string, section: string, key: string, value: string): string {
    const header = `[${section}]`;
    const start = source.indexOf(header);
    if (start < 0) {
        throw new Error(`Supabase configuration is missing [${section}]`);
    }
    const next = source.indexOf("\n[", start + header.length);
    const end = next < 0 ? source.length : next + 1;
    const block = source.slice(start, end);
    return `${source.slice(0, start)}${replaceSetting(block, key, value)}${source.slice(end)}`;
}

function replaceSetting(source: string, key: string, value: string): string {
    const lines = source.split("\n");
    const index = lines.findIndex((line) => line.trimStart().startsWith(`${key} =`));
    if (index < 0) {
        throw new Error(`Supabase configuration is missing setting ${key}`);
    }
    lines[index] = `${key} = ${value}`;
    return lines.join("\n");
}
