import type { SQL } from "bun";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { ExactDependencyPackage } from "../../../../../protocol";
import {
    assertDisposableMigrationTarget,
    establishTrustedBaseline,
    restoreTrustedBaseline,
} from "../../migrations/reset";
import { buildDependencyMatrixPlans } from "./graph";
import { applyLoadedPackageSql, createDependencyPackageLoader } from "./packages";
import type { DependencyMatrixExecution, DependencyMatrixPlan, LoadedCandidatePackage } from "./types";

export type { DependencyMatrixExecution } from "./types";

export async function executeExactDependencyMatrices(
    input: Readonly<{
        database: SQL;
        databaseId: string;
        candidate: IntegrationPackageEnvelopeV1;
        packages: readonly ExactDependencyPackage[];
        packageTempRoot?: string;
        maxCachedPackages?: number;
    }>,
    signal: AbortSignal,
): Promise<readonly DependencyMatrixExecution[]> {
    if (input.packages.length === 0) {
        return Object.freeze([]);
    }
    const loader = createDependencyPackageLoader(input);
    try {
        const candidate = await loader.loadCandidate(input.candidate);
        const packages = await Promise.all(input.packages.map(async (entry) => await loader.loadDependency(entry)));
        const plans = buildDependencyMatrixPlans(candidate, packages);
        await assertDisposableMigrationTarget(input.database, input.databaseId);
        const baseline = await establishTrustedBaseline(input.database);
        const executions: DependencyMatrixExecution[] = [];
        for (const plan of plans) {
            await restoreTrustedBaseline(input.database, baseline);
            executions.push(await executeMatrix(input.database, candidate, plan, signal));
        }
        await restoreTrustedBaseline(input.database, baseline);
        const stablePlan = plans.find((plan) => plan.selection === "stable")!;
        const stablePreparationFailure = await applyDependencies(input.database, stablePlan, signal);
        if (stablePreparationFailure) {
            const stableIndex = executions.findIndex((entry) => entry.selection === "stable");
            executions[stableIndex] = execution(candidate, stablePlan, stablePreparationFailure);
            await restoreTrustedBaseline(input.database, baseline);
        }
        return Object.freeze(executions);
    } finally {
        await loader.dispose();
    }
}

async function executeMatrix(
    database: SQL,
    candidate: LoadedCandidatePackage,
    plan: DependencyMatrixPlan,
    signal: AbortSignal,
): Promise<DependencyMatrixExecution> {
    const dependencyFailure = await applyDependencies(database, plan, signal);
    if (dependencyFailure) {
        return execution(candidate, plan, dependencyFailure);
    }
    try {
        await applyLoadedPackageSql(database, candidate, signal);
        return execution(candidate, plan);
    } catch (error) {
        rejectInfrastructureFailure(error, signal);
        return execution(candidate, plan, {
            code: "candidate-matrix-sql-rejected",
            path: `candidate.${plan.selection}`,
        });
    }
}

async function applyDependencies(
    database: SQL,
    plan: DependencyMatrixPlan,
    signal: AbortSignal,
): Promise<NonNullable<DependencyMatrixExecution["failure"]> | undefined> {
    for (const dependency of plan.packages) {
        try {
            await applyLoadedPackageSql(database, dependency, signal);
        } catch (error) {
            rejectInfrastructureFailure(error, signal);
            return {
                code: "dependency-package-sql-rejected",
                path: `dependencies.${plan.selection}.${dependency.kind}`,
            };
        }
    }
    return undefined;
}

function execution(
    candidate: LoadedCandidatePackage,
    plan: DependencyMatrixPlan,
    failure?: NonNullable<DependencyMatrixExecution["failure"]>,
): DependencyMatrixExecution {
    return {
        selection: plan.selection,
        packages: plan.packages.map(({ kind, version, packageDigest }) => ({ kind, version, packageDigest })),
        candidate: {
            kind: candidate.kind,
            version: candidate.version,
            packageDigest: candidate.packageDigest,
        },
        outcome: failure ? "failed" : "passed",
        ...(failure ? { failure } : {}),
    };
}

function rejectInfrastructureFailure(error: unknown, signal: AbortSignal): void {
    if (signal.aborted) {
        throw signal.reason;
    }
    if (error instanceof TypeError) {
        throw error;
    }
    const code = (error as { code?: unknown })?.code;
    if (
        typeof code === "string" &&
        (/^08/u.test(code) ||
            ["53300", "57P01", "57P02", "57P03", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(code))
    ) {
        throw error;
    }
}
