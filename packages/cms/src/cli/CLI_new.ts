import { join, resolve } from "node:path";
import { cp, mkdir, readdir, stat } from "node:fs/promises";

const AVAILABLE_TEMPLATES = ["full"] as const;
type TemplateName = typeof AVAILABLE_TEMPLATES[number];
const DEFAULT_TEMPLATE: TemplateName = "full";

type ParsedArgs = {
    folder:   string | null;
    template: string;
    force:    boolean;
};

function parseArgs(args: string[]): ParsedArgs {
    let folder: string | null = null;
    let template: string = DEFAULT_TEMPLATE;
    let force = false;
    for (const arg of args) {
        if (arg === "--force" || arg === "-f") force = true;
        else if (arg.startsWith("--template=")) template = arg.slice("--template=".length);
        else if (!arg.startsWith("-") && folder === null) folder = arg;
    }
    return { folder, template, force };
}

async function isEmptyOrMissing(path: string): Promise<boolean> {
    try {
        const entries = await readdir(path);
        return entries.length === 0;
    } catch {
        return true;
    }
}

export default async function CLI_new(args: string[]) {
    const { folder, template, force } = parseArgs(args);

    if (!folder) {
        console.error("✖ Missing folder name.");
        console.error("  Usage: p9r new <folder> [--template=full] [--force]");
        process.exit(1);
    }

    if (!AVAILABLE_TEMPLATES.includes(template as TemplateName)) {
        console.error(`✖ Unknown template: "${template}".`);
        console.error(`  Available: ${AVAILABLE_TEMPLATES.join(", ")}`);
        process.exit(1);
    }

    const target = resolve(process.cwd(), folder);

    const targetStat = await stat(target).catch(() => null);
    if (targetStat && !targetStat.isDirectory()) {
        console.error(`✖ "${folder}" exists and is not a directory.`);
        process.exit(1);
    }

    if (targetStat && !force && !(await isEmptyOrMissing(target))) {
        console.error(`✖ "${folder}" already exists and is not empty.`);
        console.error(`  Pick a different name, empty the folder, or pass --force.`);
        process.exit(1);
    }

    const templateDir = join(import.meta.dir, "resources", "app-templates", template);
    const templateStat = await stat(templateDir).catch(() => null);
    if (!templateStat || !templateStat.isDirectory()) {
        console.error(`✖ Template folder not found at ${templateDir}`);
        process.exit(1);
    }

    await mkdir(target, { recursive: true });
    await cp(templateDir, target, { recursive: true, force });

    console.log(`✓ Scaffolded in ${target} (template: ${template})`);
    console.log("");
    console.log("Next steps:");
    console.log(`  1. cd ${folder}`);
    console.log(`  2. cp .env.example .env        # adjust ADMIN_USERNAME / ADMIN_PASSWORD`);
    console.log(`  3. bun install`);
    console.log(`  4. bun run dev`);
}
