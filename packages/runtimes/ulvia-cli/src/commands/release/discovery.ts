import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readOptionalJsonSourceRecord } from "../../release/authored/jsonFragments";

export type ResourceSource = Readonly<{ directory: string; kind: "contract" | "provider-manifest" | "collection" }>;
const MAX_RESOURCES = 256;
const MAX_DIRECTORIES = 4096;
const MAX_DEPTH = 32;

/** A resource owns its whole subtree; nested Bloc and conformance definitions are not release roots. */
export async function discoverResources(root: string): Promise<readonly ResourceSource[]> {
    const resources: ResourceSource[] = [];
    let visited = 0;
    async function visit(directory: string, depth: number): Promise<void> {
        if (++visited > MAX_DIRECTORIES || depth > MAX_DEPTH) {
            throw new Error("Recursive release source tree exceeds its directory or depth limit");
        }
        const metadata = await lstat(directory);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
            throw new Error(`Release source must be a real directory: ${directory}`);
        }
        const definitionPath = join(directory, "definition.json");
        const entry = await lstat(definitionPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (entry && (!entry.isFile() || entry.isSymbolicLink())) {
            throw new Error(`Release definition must be a regular file: ${definitionPath}`);
        }
        const definition = await readOptionalJsonSourceRecord(definitionPath, directory);
        if (definition) {
            const kind = definition.value.kind;
            if (kind !== "contract" && kind !== "provider-manifest" && kind !== "collection") {
                throw new Error(`Unsupported release root kind at ${directory}`);
            }
            resources.push({ directory, kind });
            if (resources.length > MAX_RESOURCES) {
                throw new Error(`Recursive release must contain at most ${MAX_RESOURCES} resources`);
            }
            return;
        }
        const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
            left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
        );
        for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) {
                continue;
            }
            if (entry.isSymbolicLink()) {
                throw new Error(`Recursive release does not follow symbolic links: ${join(directory, entry.name)}`);
            }
            if (entry.isDirectory()) {
                await visit(join(directory, entry.name), depth + 1);
            }
        }
    }
    await visit(root, 0);
    if (!resources.length) {
        throw new Error(`No authored release resources found below ${root}`);
    }
    return resources;
}
