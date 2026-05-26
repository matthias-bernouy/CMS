import CLI_importBloc from "./CLI_importBloc";
import { getAccessToken } from "./credentials";
import { runPages } from "./push/pages/run";
import { runSnippets } from "./push/snippets/run";
import { runTemplates } from "./push/templates/run";
import { runSystem } from "./push/system/run";

type Flags = { force: boolean; yes: boolean; dryRun: boolean; type: string };

const TYPES = ["*", "system", "blocs", "snippets", "templates", "pages"] as const;
const ORDER = ["system", "blocs", "snippets", "templates", "pages"] as const;
type Stage = typeof ORDER[number];

function parseFlags(args: string[]): Flags {
    const f: Flags = { force: false, yes: false, dryRun: false, type: "*" };
    for (const arg of args) {
        if      (arg === "--force"   || arg === "-f") f.force = true;
        else if (arg === "--yes"     || arg === "-y") f.yes = true;
        else if (arg === "--dry-run")                 f.dryRun = true;
        else if (arg.startsWith("--type="))           f.type = arg.slice("--type=".length);
    }
    return f;
}

async function resolveAdmin(): Promise<{ adminBase: URL; token: string }> {
    const rawUrl = Bun.env.P9R_URL;
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        console.error("✖ P9R_URL must be set and start with http(s)://. Run `p9r login` after.");
        process.exit(1);
    }
    const token = await getAccessToken(rawUrl.replace(/\/+$/, ""));
    if (!token) {
        console.error(`✖ No credentials for ${rawUrl}. Run \`p9r login --url=${rawUrl}\`.`);
        process.exit(1);
    }
    return { adminBase: new URL(rawUrl.replace(/\/$/, "") + "/"), token };
}

async function runStage(stage: Stage, args: string[], adminBase: URL, token: string, flags: Flags): Promise<number> {
    switch (stage) {
        case "system":    return runSystem(adminBase, token, flags);
        case "blocs":     return CLI_importBloc(args);
        case "snippets":  return runSnippets(adminBase, token, flags);
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
