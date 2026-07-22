import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import type { DevBloc } from "../scan";

export async function readDefaultContent(bloc: DevBloc): Promise<string | undefined> {
    const relativePath = bloc.manifest.defaultContent;
    if (!relativePath) {
        return undefined;
    }
    if (isAbsolute(relativePath) || relativePath.includes("\0")) {
        throw new Error(`Invalid defaultContent path for ${bloc.tag}: must be relative`);
    }

    const normalized = normalize(relativePath);
    if (!normalized || normalized === "." || normalized.startsWith("..")) {
        throw new Error(`Invalid defaultContent path for ${bloc.tag}: must stay inside the bloc folder`);
    }

    try {
        return await readFile(join(bloc.folder, normalized), "utf-8");
    } catch {
        throw new Error(`defaultContent file not found for ${bloc.tag}: ${relativePath}`);
    }
}
