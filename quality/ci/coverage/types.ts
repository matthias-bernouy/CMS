export type CoverageMetric = {
    covered: number;
    total: number;
};

export type PackageCoverage = {
    path: string;
    coveredSourceFiles: string[];
    uncoveredSourceFiles: string[];
    files: CoverageMetric;
    functions: CoverageMetric;
    lines: CoverageMetric;
};

export type CoveragePackage = {
    name: string;
    path: string;
    hasTests: boolean;
};

export type CoverageBaseline = {
    schemaVersion: 1;
    bunVersion: string;
    packages: Record<string, PackageCoverage>;
};
