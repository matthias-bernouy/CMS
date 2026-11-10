import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RELEASE_FILES, parseStackRelease, releaseDigest } from "./model";
import type { StackRelease } from "./model";

declare const __ULVIA_STACK_RELEASE__: StackRelease | undefined;

export function embeddedStackRelease(): StackRelease | undefined {
    return typeof __ULVIA_STACK_RELEASE__ === "object" ? parseStackRelease(__ULVIA_STACK_RELEASE__) : undefined;
}

export async function sourceStackRelease(
    version: string,
    directory = resolve(import.meta.dir, "../orchestration/definitions"),
): Promise<StackRelease> {
    const files = Object.fromEntries(
        await Promise.all(RELEASE_FILES.map(async (name) => [name, await readFile(resolve(directory, name), "utf8")])),
    ) as StackRelease["files"];
    const release = { schema: "ulvia.stack-release.v1" as const, version, stackApi: 1 as const, files };
    return parseStackRelease({ ...release, digest: releaseDigest(release) });
}
