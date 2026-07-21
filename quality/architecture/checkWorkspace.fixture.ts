import { afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ArchitectureViolation } from "./checkWorkspace";

export function manifest(name: string, extra: Record<string, unknown>): string {
    return `${JSON.stringify({ name, ...extra }, null, 2)}\n`;
}

export function createWorkspaceFixture(): {
    createWorkspace: (files: Record<string, string>) => Promise<string>;
} {
    const temporaryRoots: string[] = [];
    afterEach(async () => {
        const roots = temporaryRoots.splice(0);
        await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    });

    return {
        async createWorkspace(files: Record<string, string>): Promise<string> {
            const root = await mkdtemp(join(tmpdir(), "cmscore-architecture-"));
            temporaryRoots.push(root);
            for (const [path, contents] of Object.entries(files)) {
                const absolutePath = join(root, path);
                await mkdir(dirname(absolutePath), { recursive: true });
                await writeFile(absolutePath, contents);
            }
            return root;
        },
    };
}

export function ofKind<K extends ArchitectureViolation["kind"]>(
    violations: readonly ArchitectureViolation[],
    kind: K,
): ArchitectureViolation[] {
    return violations.filter((violation) => violation.kind === kind);
}
