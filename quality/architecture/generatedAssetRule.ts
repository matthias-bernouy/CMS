import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ArchitectureViolation, GeneratedAssetCheck } from "./architectureTypes";
import { isMissingPathError, normalizeRelativePath } from "./pathUtils";

export async function checkGeneratedAsset(
    rootDir: string,
    check: GeneratedAssetCheck,
    violations: ArchitectureViolation[],
): Promise<void> {
    const assetPath = resolve(rootDir, check.path);
    let tracked: string;
    try {
        tracked = await readFile(assetPath, "utf8");
    } catch (error) {
        if (!isMissingPathError(error)) throw error;
        violations.push({
            kind: "generated-asset-drift",
            file: normalizeRelativePath(check.path),
            message: "generated asset is missing",
        });
        return;
    }

    const generated = await check.generate();
    const normalizeContents = check.normalize ?? ((contents: string) => contents);
    if (normalizeContents(tracked) === normalizeContents(generated)) return;
    violations.push({
        kind: "generated-asset-drift",
        file: normalizeRelativePath(check.path),
        message: "tracked generated asset differs from a fresh build",
    });
}
