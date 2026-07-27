import {
    type BlocOwnership,
    isValidResourceIdentifier,
    sameBlocOwner,
    type SiteBlocDefinition,
} from "@bernouy/cms-content";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { relocateBlocSourceAtomically, writeBlocSourceAtomically } from "cms-cli/push/blocs/atomicSource";
import { parseSiteBlocDefinition } from "cms-cli/push/blocs/siteBuilder";
import { categoryToFolder } from "cms-cli/push/shared/categoryFolder";
import { safeJoin } from "cms-cli/push/shared/safeJoin";

export function assertSafeBlocTag(tag: string): void {
    if (!isValidResourceIdentifier(tag)) {
        throw new Error(`Invalid remote bloc tag "${tag}": a lower-case resource identifier is required`);
    }
}

export async function writePulledBloc(
    siteDir: string,
    group: string,
    tag: string,
    source: Record<string, string>,
    remoteOwnership: BlocOwnership,
): Promise<void> {
    assertSafeBlocTag(tag);
    const root = safeJoin(siteDir, "blocs");
    const target = safeJoin(root, categoryToFolder(group), tag);
    const incoming = incomingDefinition(source);
    if (!incoming && remoteOwnership.kind === "site-builder") {
        throw new Error(`Remote site-builder bloc "${tag}" has no builder.json`);
    }
    if (incoming && !sameBlocOwner(incoming.ownership, remoteOwnership)) {
        throw new Error(`Remote builder ownership for bloc "${tag}" does not match list ownership`);
    }
    const localFolders = await findLocalBlocFolders(root, tag);
    assertNoForeignSiteBuilderFolder(tag, remoteOwnership, localFolders);
    if (!incoming) {
        await writeBlocSourceAtomically(target, source);
        return;
    }
    if (incoming.tag !== tag) {
        throw new Error(`Remote builder tag "${incoming.tag}" does not match list tag "${tag}"`);
    }
    const existing = matchingSiteBuilderFolders(tag, localFolders);
    if (existing.length > 1) {
        throw new Error(`Refusing to move site-builder bloc "${tag}": multiple local folders claim its ownership`);
    }
    const previous = existing[0];
    if (previous && previous !== target) {
        await relocateBlocSourceAtomically(previous, target, source);
        return;
    }
    await writeBlocSourceAtomically(target, source);
}

type LocalBlocFolder = {
    path: string;
    definition: SiteBlocDefinition | null;
};

function incomingDefinition(source: Record<string, string>): SiteBlocDefinition | null {
    const encoded = source["builder.json"];
    return encoded
        ? parseSiteBlocDefinition(Buffer.from(encoded, "base64").toString("utf-8"), "remote builder.json")
        : null;
}

async function findLocalBlocFolders(root: string, tag: string): Promise<LocalBlocFolder[]> {
    let categories;
    try {
        categories = await readdir(root, { withFileTypes: true });
    } catch {
        return [];
    }
    const folders: LocalBlocFolder[] = [];
    for (const category of categories) {
        if (!category.isDirectory() || category.name.startsWith(".")) {
            continue;
        }
        const folder = safeJoin(root, category.name, tag);
        if (!existsSync(folder)) {
            continue;
        }
        const stats = await lstat(folder);
        const builderPath = join(folder, "builder.json");
        const definition =
            stats.isDirectory() && existsSync(builderPath)
                ? parseSiteBlocDefinition(await readFile(builderPath, "utf-8"), builderPath)
                : null;
        folders.push({ path: folder, definition });
    }
    return folders;
}

function assertNoForeignSiteBuilderFolder(
    tag: string,
    remoteOwnership: BlocOwnership,
    localFolders: LocalBlocFolder[],
): void {
    for (const folder of localFolders) {
        if (
            folder.definition &&
            (folder.definition.tag !== tag || !sameBlocOwner(folder.definition.ownership, remoteOwnership))
        ) {
            throw new Error(`Refusing to replace local bloc folder "${folder.path}" owned by another definition`);
        }
    }
}

function matchingSiteBuilderFolders(tag: string, localFolders: LocalBlocFolder[]): string[] {
    return localFolders.map((folder) => {
        if (!folder.definition) {
            throw new Error(`Refusing to replace unrecognized local bloc folder "${folder.path}"`);
        }
        if (folder.definition.tag !== tag) {
            throw new Error(`Refusing to replace local bloc folder "${folder.path}" owned by another definition`);
        }
        return folder.path;
    });
}
