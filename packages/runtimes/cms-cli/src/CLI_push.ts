import { getAccessToken } from "./credentials";
import { runPages } from "./push/pages/run";
import { runTemplates } from "./push/templates/run";
import { runSystem } from "./push/system/run";
import { runFiles } from "./push/files/run";
import { runIntegrations } from "./push/integrations/run";
import { runBlocs } from "./push/blocs/run";

type Flags = { force: boolean; yes: boolean; dryRun: boolean; type: string; only: Set<string> | null };

const TYPES = ["*", "system", "integrations", "files", "blocs", "templates", "pages"] as const;
// Files (media) ship right after system so pages/templates that reference
// `/.cms/files/<path>` resolve once the rest of the content lands. Integrations
// ship right after system too because they generate source contracts referenced
// at runtime via `/.cms/sources/*`.
const ORDER = ["system", "integrations", "files", "blocs", "templates", "pages"] as const;
type Stage = typeof ORDER[number];

function parseFlags(args: string[]): Flags {
    const f: Flags = { force: false, yes: false, dryRun: false, type: "*", only: null };
    for (const arg of args) {
        if      (arg === "--force"   || arg === "-f") f.force = true;
        else if (arg === "--yes"     || arg === "-y") f.yes = true;
        else if (arg === "--dry-run")                 f.dryRun = true;
        else if (arg.startsWith("--type="))           f.type = arg.slice("--type=".length);
        else if (arg.startsWith("--only=")) {
            f.only = new Set(arg.slice("--only=".length).split(",").map(s => s.trim()).filter(Boolean));
        }
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

async function runStage(stage: Stage, args: string[], adminBase: URL, token: string, flags: Flags): Promise<number> {
    switch (stage) {
        case "system":    return runSystem(adminBase, token, flags);
        case "integrations": return runIntegrations(adminBase, token, flags);
        case "files":     return runFiles(adminBase, token, flags);
        case "blocs":     return runBlocs(adminBase, token, flags);
        case "templates": return runTemplates(adminBase, token, flags);
        case "pages":     return runPages(adminBase, token, flags);
    }
}

export default async function CLI_push(args: string[]) {
    const flags = parseFlags(args);
    if (!TYPES.includes(flags.type as typeof TYPES[number])) {
        console.error(`✖ --type=${flags.type} unknown. Available: ${TYPES.join(", ")}.`);
        process.exit(1);
    }

    const { adminBase, token } = await resolveAdmin();
    console.log(`→ Tenant   : ${adminBase.href.replace(/\/$/, "")}`);

    const targets: readonly Stage[] = flags.type === "*" ? ORDER : [flags.type as Stage];

    for (const stage of targets) {
        if (targets.length > 1) console.log(`\n— ${stage} —`);
        const code = await runStage(stage, args, adminBase, token, flags);
        if (code !== 0) process.exit(code);
    }
}
