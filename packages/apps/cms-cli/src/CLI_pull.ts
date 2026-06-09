import { existsSync } from "node:fs";
import { getAccessToken } from "./credentials";
import { loadPushConfig } from "./push/shared/config";
import { confirm } from "./push/shared/recap";
import { pullBlocs } from "./push/blocs/pull";
import { pullPages } from "./push/pages/pull";
import { pullSnippets } from "./push/snippets/pull";
import { pullTemplates } from "./push/templates/pull";
import { pullSystem } from "./push/system/pull";
import { pullGateways } from "./push/gateways/pull";

type Flags = { force: boolean; yes: boolean; type: string };

const TYPES = ["*", "system", "gateways", "blocs", "snippets", "templates", "pages"] as const;
const ORDER = ["system", "gateways", "blocs", "snippets", "templates", "pages"] as const;
type Stage = typeof ORDER[number];

function parseFlags(args: string[]): Flags {
    const f: Flags = { force: false, yes: false, type: "*" };
    for (const arg of args) {
        if      (arg === "--force" || arg === "-f") f.force = true;
        else if (arg === "--yes"   || arg === "-y") f.yes = true;
        else if (arg.startsWith("--type="))         f.type = arg.slice("--type=".length);
    }
    return f;
}

async function resolveAdmin(): Promise<{ adminBase: URL; token: string }> {
    const rawUrl = Bun.env.P9R_URL;
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        console.error("✖ P9R_URL must be set and start with http(s)://.");
        process.exit(1);
    }
    const token = await getAccessToken(rawUrl.replace(/\/+$/, ""));
    if (!token) {
        console.error(`✖ No token for ${rawUrl}. Set P9R_TOKEN to a CMS Personal Access Token (admin → Profile), or add it to ~/.config/p9r/credentials.json.`);
        process.exit(1);
    }
    return { adminBase: new URL(rawUrl.replace(/\/$/, "") + "/"), token };
}

async function runStage(stage: Stage, adminBase: URL, token: string, siteDir: string): Promise<void> {
    if      (stage === "system")    await pullSystem(adminBase, token, siteDir);
    else if (stage === "gateways")  reportItems   (await pullGateways(adminBase, token, siteDir), "gateways", "urn");
    else if (stage === "blocs")     reportBlocs   (await pullBlocs   (adminBase, token, siteDir));
    else if (stage === "snippets")  reportItems   (await pullSnippets(adminBase, token, siteDir), "snippets", "identifier");
    else if (stage === "templates") reportTemplates(await pullTemplates(adminBase, token, siteDir));
    else                            reportItems   (await pullPages   (adminBase, token, siteDir), "pages", "path");
    if (stage === "system") console.log("→ system: pulled.");
}

function reportItems(r: { pulled: string[]; failed: { error: string }[] & ({ path?: string; identifier?: string; urn?: string }[]) }, label: string, key: "path" | "identifier" | "urn"): void {
    for (const ok of r.pulled) console.log(`    ✓ ${ok}`);
    for (const ko of r.failed as Array<Record<string, string>>) console.error(`    ✗ ${ko[key]}: ${ko.error}`);
    console.log(`→ ${label}: ${r.pulled.length} pulled, ${r.failed.length} failed.`);
}

function reportBlocs(r: { pulled: string[]; skipped: { tag: string; reason: string }[]; failed: { tag: string; error: string }[] }): void {
    for (const ok of r.pulled)  console.log  (`    ✓ ${ok}`);
    for (const sk of r.skipped) console.warn (`    ⚠ ${sk.tag}: ${sk.reason}`);
    for (const ko of r.failed)  console.error(`    ✗ ${ko.tag}: ${ko.error}`);
    console.log(`→ blocs: ${r.pulled.length} pulled, ${r.skipped.length} skipped, ${r.failed.length} failed.`);
}

function reportTemplates(r: { pulled: string[]; skipped: { reason: string }[]; failed: { identifier: string; error: string }[] }): void {
    for (const ok of r.pulled)  console.log  (`    ✓ ${ok}`);
    for (const sk of r.skipped) console.warn (`    ⚠ ${sk.reason}`);
    for (const ko of r.failed)  console.error(`    ✗ ${ko.identifier}: ${ko.error}`);
    console.log(`→ templates: ${r.pulled.length} pulled, ${r.skipped.length} skipped, ${r.failed.length} failed.`);
}

export default async function CLI_pull(args: string[]) {
    const flags = parseFlags(args);
    if (!TYPES.includes(flags.type as typeof TYPES[number])) {
        console.error(`✖ --type=${flags.type} unknown. Available: ${TYPES.join(", ")}.`);
        process.exit(1);
    }

    const { adminBase, token } = await resolveAdmin();
    const config = await loadPushConfig(process.cwd());

    console.log(`→ Tenant   : ${adminBase.href.replace(/\/$/, "")}`);
    console.log(`→ Site dir : ${config.siteDir}`);
    if (existsSync(config.siteDir) && !flags.force) {
        if (!await confirm(`⚠ ${config.siteDir} exists — pull will overwrite matching files. Continue?`, flags.yes)) {
            console.log("→ Aborted.");
            return;
        }
    }

    const targets: readonly Stage[] = flags.type === "*" ? ORDER : [flags.type as Stage];
    for (const stage of targets) {
        if (targets.length > 1) console.log(`\n— ${stage} —`);
        await runStage(stage, adminBase, token, config.siteDir);
    }
}
