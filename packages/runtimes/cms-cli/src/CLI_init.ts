import { basename, join, resolve } from "node:path";
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

const AVAILABLE_TEMPLATES = ["full"] as const;
export type InitTemplateName = typeof AVAILABLE_TEMPLATES[number];

export type InitArgs = {
    folder:   string | null;
    template: string;
    force:    boolean;
};

export type ScaffoldProjectOptions = {
    cwd:      string;
    folder:   string;
    template: string;
    force:    boolean;
};

export function parseInitArgs(args: string[]): InitArgs {
    let folder: string | null = null;
    let template = "full";
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

export async function scaffoldProject(options: ScaffoldProjectOptions): Promise<{ target: string; template: InitTemplateName }> {
    const template = options.template as InitTemplateName;
    if (!AVAILABLE_TEMPLATES.includes(template)) {
        throw new Error(`✖ Unknown template: "${options.template}".\n  Available: ${AVAILABLE_TEMPLATES.join(", ")}`);
    }

    const target = resolve(options.cwd, options.folder);

    const targetStat = await stat(target).catch(() => null);
    if (targetStat && !targetStat.isDirectory()) {
        throw new Error(`✖ "${options.folder}" exists and is not a directory.`);
    }

    if (targetStat && !options.force && !(await isEmptyOrMissing(target))) {
        throw new Error(`✖ "${options.folder}" already exists and is not empty.\n  Pick a different name, empty the folder, or pass --force.`);
    }

    const templateDir = join(import.meta.dir, "resources", "app-templates", template);
    const templateStat = await stat(templateDir).catch(() => null);
    if (!templateStat || !templateStat.isDirectory()) {
        throw new Error(`✖ Template folder not found at ${templateDir}`);
    }

    await mkdir(target, { recursive: true });
    await cp(templateDir, target, { recursive: true, force: true });
    await applyProjectName(target);

    return { target, template };
}

export default async function CLI_init(args: string[]) {
    const { folder, template, force } = parseInitArgs(args);

    if (!folder) {
        console.error("✖ Missing folder name.");
        console.error("  Usage: p9r init <folder> [--template=full] [--force]");
        process.exit(1);
    }

    let result: { target: string; template: InitTemplateName };
    try {
        result = await scaffoldProject({ cwd: process.cwd(), folder, template, force });
    } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    }

    console.log(`✓ Project scaffolded in ${result.target} (template: ${result.template})`);
    console.log("");
    console.log("Next steps:");
    console.log(`  1. cd ${folder}`);
    console.log(`  2. bun install`);
    console.log(`  3. bun run dev`);
}

async function applyProjectName(target: string): Promise<void> {
    const packageFile = join(target, "package.json");
    const raw = await readFile(packageFile, "utf-8").catch(() => null);
    if (raw === null) return;

    const next = raw.replaceAll("__PROJECT_NAME__", packageNameFromFolder(target));
    if (next !== raw) await writeFile(packageFile, next, "utf-8");
}

function packageNameFromFolder(target: string): string {
    const name = basename(target)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+/, "")
        .replace(/[._-]+$/, "");
    return name || "cms-site";
}
