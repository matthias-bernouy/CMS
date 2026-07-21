import { isPackageSourceFile, normalizePath } from "../paths";
import type { PackageCoverage } from "../types";

type LcovRecord = {
    sourceFile?: string;
    functionsFound: number;
    functionsHit: number;
    linesFound: number;
    linesHit: number;
};

function emptyRecord(): LcovRecord {
    return { functionsFound: 0, functionsHit: 0, linesFound: 0, linesHit: 0 };
}

export function parseLcov(lcov: string, packagePath: string): Pick<PackageCoverage, "functions" | "lines"> & {
    coveredFiles: Set<string>;
} {
    const records: LcovRecord[] = [];
    let current = emptyRecord();
    const finishRecord = () => {
        if (current.sourceFile && isPackageSourceFile(current.sourceFile, packagePath)) records.push(current);
        current = emptyRecord();
    };

    for (const line of lcov.split(/\r?\n/)) {
        const separator = line.indexOf(":");
        const key = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? "" : line.slice(separator + 1);
        switch (key) {
            case "SF": current.sourceFile = normalizePath(value); break;
            case "FNF": current.functionsFound = Number.parseInt(value, 10); break;
            case "FNH": current.functionsHit = Number.parseInt(value, 10); break;
            case "LF": current.linesFound = Number.parseInt(value, 10); break;
            case "LH": current.linesHit = Number.parseInt(value, 10); break;
            case "end_of_record": finishRecord(); break;
        }
    }

    return {
        coveredFiles: new Set(records.map((record) => record.sourceFile!)),
        functions: {
            covered: records.reduce((total, record) => total + record.functionsHit, 0),
            total: records.reduce((total, record) => total + record.functionsFound, 0),
        },
        lines: {
            covered: records.reduce((total, record) => total + record.linesHit, 0),
            total: records.reduce((total, record) => total + record.linesFound, 0),
        },
    };
}
