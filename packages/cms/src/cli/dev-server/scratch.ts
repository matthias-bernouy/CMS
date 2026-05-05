import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * The dev CLI cannot persist pages to the remote CMS (writes are blocked).
 * Instead, `POST /api/page` is intercepted and written to this scratch file
 * inside the user's working directory. On the next editor load the shell
 * hydrates `#editor` from the scratch file so the user keeps their work
 * across reloads.
 */
export type ScratchPage = {
    content: string;
    path: string;
    title: string;
    description: string;
    visible: boolean;
    tags: string;
    updatedAt: string;
};

const DEFAULT_SCRATCH: ScratchPage = {
    content: "<p></p>",
    path: "/dev",
    title: "Dev page",
    description: "Local dev mode — writes disabled",
    visible: true,
    tags: "",
    updatedAt: new Date(0).toISOString(),
};

const SCRATCH_DIR = ".p9r-dev";
const SCRATCH_FILE = "scratch.json";

export function scratchPath(cwd: string): string {
    return join(cwd, SCRATCH_DIR, SCRATCH_FILE);
}

export async function loadScratch(cwd: string): Promise<ScratchPage> {
    try {
        const raw = await readFile(scratchPath(cwd), "utf-8");
        const parsed = JSON.parse(raw) as Partial<ScratchPage>;
        return { ...DEFAULT_SCRATCH, ...parsed };
    } catch {
        return { ...DEFAULT_SCRATCH };
    }
}

export async function saveScratch(cwd: string, patch: Partial<ScratchPage>): Promise<ScratchPage> {
    const current = await loadScratch(cwd);
    const next: ScratchPage = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    const file = scratchPath(cwd);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(next, null, 2), "utf-8");
    return next;
}
