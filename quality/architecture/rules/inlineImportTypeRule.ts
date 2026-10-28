import * as ts from "@typescript/typescript6";
import type { ArchitectureViolation } from "../core/architectureTypes";
import { toRelativePath } from "../core/pathUtils";
import { lineOf } from "../core/sourceImports";

/** Keep type dependencies visible in the file's import declarations. */
export function checkInlineImportTypes(
    file: string,
    sourceFile: ts.SourceFile,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    const visit = (node: ts.Node): void => {
        if (ts.isImportTypeNode(node)) {
            violations.push({
                kind: "inline-import-type",
                file: toRelativePath(rootDir, file),
                line: lineOf(sourceFile, node),
                message: "Use a top-level import type declaration instead of an inline import type",
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}
