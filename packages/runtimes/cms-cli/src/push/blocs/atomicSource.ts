import { ContentValidationError } from "@bernouy/cms-content";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { safeJoin } from "cms-cli/push/shared/safeJoin";

export type StagedBlocSource = {
    path: string;
    commit(): Promise<void>;
    discard(): Promise<void>;
};

export async function stageBlocSource(target: string, source: Record<string, string>): Promise<StagedBlocSource> {
    validateSourcePaths(source);
    const parent = dirname(target);
    await mkdir(parent, { recursive: true });
    const staged = await mkdtemp(join(parent, `.${basename(target)}.p9r-stage-`));
    try {
        await writeSourceFiles(staged, source);
    } catch (error) {
        await rm(staged, { recursive: true, force: true });
        throw error;
    }

    let settled = false;
    return {
        path: staged,
        async commit() {
            if (settled) {
                throw new Error(`Bloc source transaction for "${target}" is already settled`);
            }
            settled = true;
            await commitStagedDirectory(staged, target);
        },
        async discard() {
            if (settled) {
                return;
            }
            settled = true;
            await rm(staged, { recursive: true, force: true });
        },
    };
}

export async function writeBlocSourceAtomically(target: string, source: Record<string, string>): Promise<void> {
    const staged = await stageBlocSource(target, source);
    try {
        await staged.commit();
    } catch (error) {
        await staged.discard();
        throw error;
    }
}

export async function relocateBlocSourceAtomically(
    previous: string,
    target: string,
    source: Record<string, string>,
): Promise<void> {
    if (previous === target) {
        return writeBlocSourceAtomically(target, source);
    }
    const staged = await stageBlocSource(target, source);
    const backup = join(dirname(previous), `.${basename(previous)}.p9r-move-${randomUUID()}`);
    let previousMoved = false;
    try {
        if (existsSync(target)) {
            throw new ContentValidationError("source", `refusing to replace existing bloc folder "${target}"`);
        }
        await rename(previous, backup);
        previousMoved = true;
        await rename(staged.path, target);
    } catch (error) {
        let restoreError: unknown;
        if (previousMoved && existsSync(backup)) {
            try {
                await rename(backup, previous);
            } catch (caught) {
                restoreError = caught;
            }
        }
        await staged.discard();
        if (restoreError) {
            throw new Error(
                `Failed to relocate bloc source and restore "${previous}": ${errorMessage(error)}; restore: ${errorMessage(restoreError)}`,
            );
        }
        throw error;
    }
    await staged.discard();
    await rm(backup, { recursive: true, force: true }).catch(() => undefined);
}

async function commitStagedDirectory(staged: string, target: string): Promise<void> {
    const backup = `${staged}.previous`;
    const hadTarget = existsSync(target);
    try {
        if (hadTarget) {
            await rename(target, backup);
        }
        await rename(staged, target);
    } catch (error) {
        if (hadTarget && existsSync(backup)) {
            try {
                await rename(backup, target);
            } catch (restoreError) {
                throw new Error(
                    `Failed to install bloc source and restore "${target}": ${errorMessage(error)}; restore: ${errorMessage(restoreError)}`,
                );
            }
        }
        await rm(staged, { recursive: true, force: true });
        throw error;
    }
    if (hadTarget) {
        await rm(backup, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function writeSourceFiles(target: string, source: Record<string, string>): Promise<void> {
    for (const [relativePath, base64] of Object.entries(source)) {
        const full = safeJoin(target, relativePath);
        await mkdir(dirname(full), { recursive: true });
        const decoded = Buffer.from(base64, "base64");
        const bytes = isManifest(relativePath)
            ? Buffer.from(stripLegacyManifestFields(decoded.toString("utf-8")), "utf-8")
            : decoded;
        await writeFile(full, bytes);
    }
}

function validateSourcePaths(source: Record<string, string>): void {
    const resolvedPaths = new Set<string>();
    for (const relativePath of Object.keys(source)) {
        if (!relativePath || relativePath.includes("\0")) {
            throw new ContentValidationError("source", `invalid source path "${relativePath}"`);
        }
        const resolved = safeJoin("/p9r-source-root", relativePath);
        if (resolvedPaths.has(resolved)) {
            throw new ContentValidationError("source", `duplicate normalized source path "${relativePath}"`);
        }
        resolvedPaths.add(resolved);
    }
}

function isManifest(path: string): boolean {
    return path === "manifest.json" || path === "./manifest.json";
}

function stripLegacyManifestFields(raw: string): string {
    try {
        const manifest = JSON.parse(raw) as Record<string, unknown>;
        if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || !("default-group" in manifest)) {
            return raw;
        }
        delete manifest["default-group"];
        return `${JSON.stringify(manifest, null, 4)}\n`;
    } catch {
        return raw;
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
