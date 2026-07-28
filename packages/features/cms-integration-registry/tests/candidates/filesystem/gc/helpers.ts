import { readdirSync } from "node:fs";
import { join } from "node:path";

export function objectEntries(root: string, kind: string): string[] {
    return readdirSync(join(root, ".registry", "candidates", "objects", kind));
}

export function objectPath(root: string, kind: string, digest: string): string {
    return join(root, ".registry", "candidates", "objects", kind, `${digest}.json`);
}
