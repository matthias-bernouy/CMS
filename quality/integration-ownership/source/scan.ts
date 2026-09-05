import { readFile } from "node:fs/promises";
import type * as ts from "typescript";
import type { WorkspacePackage } from "../../architecture/core/architectureTypes";
import { isPathInside, toRelativePath } from "../../architecture/core/pathUtils";
import { collectImports, createSourceFile } from "../../architecture/core/sourceImports";
import type { IntegrationCatalog, IntegrationOwnershipFinding } from "../types";
import { checkStringEvidence } from "./stringEvidence";

export interface ScannedSource {
    file: string;
    imports: readonly string[];
}

export async function scanPackageSources(
    repositoryRoot: string,
    packages: readonly WorkspacePackage[],
    catalog: IntegrationCatalog,
): Promise<{ findings: IntegrationOwnershipFinding[]; sources: ScannedSource[] }> {
    const findings: IntegrationOwnershipFinding[] = [];
    const sources: ScannedSource[] = [];
    const kinds = new Set(catalog.descriptors.map(({ kind }) => kind));
    const blocTags = [...catalog.identifiers]
        .filter(([, owners]) => owners.some(({ category }) => category === "bloc-tag"))
        .map(([identifier]) => identifier);

    for (const pkg of packages) {
        for (const file of pkg.sourceFiles) {
            if (catalog.descriptors.some(({ root }) => isPathInside(file, root))) {
                continue;
            }
            const source = await readFile(file, "utf8");
            const sourceFile = createSourceFile(file, source);
            sources.push({ file, imports: collectImports(sourceFile).map(({ specifier }) => specifier) });
            const sameOfficialPackage = isPathInside(file, catalog.packageRoot);
            const hasOfficialImport = checkOfficialImports(sourceFile, sameOfficialPackage, repositoryRoot, findings);
            const hasAuthoringPath = source
                .replaceAll("\\", "/")
                .includes("packages/resources/official-integrations/integrations");
            checkStringEvidence({
                sourceFile,
                kinds,
                blocTags,
                catalog,
                repositoryRoot,
                inspectKinds: sameOfficialPackage || hasOfficialImport || hasAuthoringPath,
                findings,
            });
        }
    }
    return { findings, sources };
}

function checkOfficialImports(
    sourceFile: ts.SourceFile,
    sameOfficialPackage: boolean,
    repositoryRoot: string,
    findings: IntegrationOwnershipFinding[],
): boolean {
    if (sameOfficialPackage) {
        return false;
    }
    let found = false;
    for (const imported of collectImports(sourceFile)) {
        if (!/^@bernouy\/cms-official-integrations(?:\/|$)/.test(imported.specifier)) {
            continue;
        }
        findings.push({
            confidence: "high",
            evidence: "official-package-import",
            file: toRelativePath(repositoryRoot, sourceFile.fileName),
            line: imported.line,
            message: `Imports the concrete official integration authoring package (${imported.specifier}).`,
            owners: [],
        });
        found = true;
    }
    return found;
}
