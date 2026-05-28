import { join, resolve } from "node:path";
import { cp, mkdir, readdir, stat } from "node:fs/promises";

function parseArgs(args: string[]): { force: boolean } {
    let force = false;
    for (const arg of args) {
        if (arg === "--force" || arg === "-f") force = true;
    }
    return { force };
}

async function isEmptyOrMissing(path: string): Promise<boolean> {
    try {
        const entries = await readdir(path);
        return entries.length === 0;
    } catch {
        return true;
    }
}

export default async function CLI_installSkill(args: string[]) {
    const { force } = parseArgs(args);

    const sourceDir = join(import.meta.dir, "..", "..", ".claude", "skills", "bloc-creator");
    const sourceStat = await stat(sourceDir).catch(() => null);
    if (!sourceStat || !sourceStat.isDirectory()) {
        console.error(`✖ Skill folder not found at ${sourceDir}`);
        console.error(`  Make sure you are running p9r from an installed @bernouy/cms package.`);
        process.exit(1);
    }

    const target = resolve(process.cwd(), ".claude", "skills", "bloc-creator");

    const targetStat = await stat(target).catch(() => null);
    if (targetStat && !targetStat.isDirectory()) {
        console.error(`✖ "${target}" exists and is not a directory.`);
        process.exit(1);
    }

    if (targetStat && !force && !(await isEmptyOrMissing(target))) {
        console.error(`✖ Skill is already installed at ${target}`);
        console.error(`  Pass --force to overwrite.`);
        process.exit(1);
    }

    await mkdir(target, { recursive: true });
    await cp(sourceDir, target, { recursive: true, force });

    console.log(`✓ bloc-creator skill installed at ${target}`);
    console.log("");
    console.log("The skill is now discoverable by Claude Code in this project.");
    console.log("Ask Claude to \"create a new bloc\" to trigger it.");
}
