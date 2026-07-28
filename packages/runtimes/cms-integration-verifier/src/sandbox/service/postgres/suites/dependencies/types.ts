import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { ExactDependencyPackage } from "../../../../../protocol";

export type LoadedDependencyPackage = ExactDependencyPackage &
    Readonly<{
        root: string;
        definition: IntegrationDefinition;
    }>;

export type LoadedCandidatePackage = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    root: string;
    definition: IntegrationDefinition;
}>;

export type DependencyMatrixPlan = Readonly<{
    selection: "minimum" | "stable";
    packages: readonly LoadedDependencyPackage[];
}>;

export type DependencyMatrixExecution = Readonly<{
    selection: "minimum" | "stable";
    packages: readonly Readonly<{
        kind: string;
        version: string;
        packageDigest: string;
    }>[];
    candidate: Readonly<{
        kind: string;
        version: string;
        packageDigest: string;
    }>;
    outcome: "passed" | "failed";
    failure?: Readonly<{
        code: "dependency-package-sql-rejected" | "candidate-matrix-sql-rejected";
        path: string;
    }>;
}>;
