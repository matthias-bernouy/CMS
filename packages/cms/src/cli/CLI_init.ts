import { join, resolve } from "node:path";
import { cp, mkdir, readdir, stat } from "node:fs/promises";

function parseArgs(args: string[]): { folder: string | null; force: boolean } {
    let folder: string | null = null;
    let force = false;
    for (const arg of args) {
        if (arg === "--force" || arg === "-f") force = true;
        else if (!arg.startsWith("-") && folder === null) folder = arg;
    }
    return { folder, force };
}

async function isEmptyOrMissing(path: string): Promise<boolean> {
    try {
        const entries = await readdir(path);
        return entries.length === 0;
    } catch {
        return true;
    }
}

export default async function CLI_init(args: string[]) {
    const { folder, force } = parseArgs(args);

    if (!folder) {
        console.error("✖ Missing folder name.");
        console.error("  Usage: p9r init <folder>");
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

    const templateDir = join(import.meta.dir, "resources", "bloc-template");
    const templateStat = await stat(templateDir).catch(() => null);
    if (!templateStat || !templateStat.isDirectory()) {
        console.error(`✖ Template folder not found at ${templateDir}`);
        process.exit(1);
    }

    await mkdir(target, { recursive: true });
    await cp(templateDir, target, { recursive: true, force });

    console.log(`✓ Bloc scaffold created in ${target}`);
    console.log("");
    console.log("Next steps:");
    console.log(`  1. cd ${folder}`);
    console.log(`  2. Edit manifest.json — set "default-tag"`);
    console.log(`  3. Move the folder under blocs/<group>/<tag>/ (or blocs/_uncategorized/<tag>/)`);
    console.log(`  4. Customize Bloc.ts, template.html, style.css`);
    console.log(`  5. Customize BlocEditor.ts + configuration.html (or delete them for an opaque bloc)`);
    console.log(`  6. From the site root: p9r dev    (to preview)`);
    console.log(`     or:                 p9r import (to push to the remote CMS)`);
}
