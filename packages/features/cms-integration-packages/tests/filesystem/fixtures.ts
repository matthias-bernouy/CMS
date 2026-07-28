import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function createVersionRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-package-"));
    writeText(root, "definition.json", '{"kind":"demo","label":"Demo","version":"1.0.0","inputs":[]}');
    writeText(root, "release-notes.md", "## Changes\n\nInitial release.\n");
    return root;
}

export function writeText(root: string, path: string, content: string): void {
    writeBytes(root, path, new TextEncoder().encode(content));
}

export function writeBytes(root: string, path: string, content: Uint8Array): void {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
}

export function readerOptions(root: string) {
    return {
        root,
        kind: "demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
    } as const;
}
