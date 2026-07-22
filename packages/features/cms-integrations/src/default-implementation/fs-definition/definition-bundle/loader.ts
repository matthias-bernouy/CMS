import { readFile, stat } from "node:fs/promises";
import { displayPath } from "./paths";
import type { DefinitionBundleState } from "./types";

export async function withJsonFile<T>(
    file: string,
    state: DefinitionBundleState,
    depth: number,
    consume: (value: unknown) => Promise<T> | T,
): Promise<T> {
    assertDepth(state, depth);
    assertNoCycle(state, file);
    state.activeFiles.push(file);
    try {
        const value = await readJsonDocument(file, state);
        return await consume(value);
    } finally {
        state.activeFiles.pop();
    }
}

async function readJsonDocument(file: string, state: DefinitionBundleState): Promise<unknown> {
    state.filesRead += 1;
    if (state.filesRead > state.limits.maxFiles) {
        throw new Error(`Integration definition bundle exceeds the ${state.limits.maxFiles}-file limit`);
    }
    const sourceSize = (await stat(file)).size;
    if (state.bytesRead + sourceSize > state.limits.maxBytes) {
        throw new Error(`Integration definition bundle exceeds the ${state.limits.maxBytes}-byte limit`);
    }
    const source = await readFile(file, "utf8");
    state.bytesRead += Buffer.byteLength(source, "utf8");
    if (state.bytesRead > state.limits.maxBytes) {
        throw new Error(`Integration definition bundle exceeds the ${state.limits.maxBytes}-byte limit`);
    }
    try {
        return JSON.parse(source);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${displayPath(state.versionRoot, file)}: invalid JSON: ${message}`);
    }
}

function assertDepth(state: DefinitionBundleState, depth: number): void {
    if (depth > state.limits.maxDepth) {
        throw new Error(`Integration definition bundle exceeds the ${state.limits.maxDepth}-level inclusion limit`);
    }
}

function assertNoCycle(state: DefinitionBundleState, file: string): void {
    const cycleStart = state.activeFiles.indexOf(file);
    if (cycleStart < 0) {
        return;
    }
    const cycle = [...state.activeFiles.slice(cycleStart), file]
        .map((item) => displayPath(state.versionRoot, item))
        .join(" -> ");
    throw new Error(`Cyclic integration definition inclusion: ${cycle}`);
}
