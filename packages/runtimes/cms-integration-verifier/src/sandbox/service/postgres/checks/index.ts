import {
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    type PlatformVerificationEvidenceV1,
    type PlatformVerificationSuiteDefinitionV1,
} from "@bernouy/cms-integration-verification";
import { checkEvidence, notApplicableEvidence, suiteEvidence } from "../evidence";
import type {
    BoundarySnapshot,
    GrantObservation,
    LoadedSqlPackage,
    ObservedConnectorSchema,
    RlsObservation,
    RoutineObservation,
    ViewObservation,
} from "../types";
import { boundaryChecks, failedSqlEvidence, installChecks, schemaContractCheck } from "./execution";
import { grantChecks, rlsChecks, routineChecks, viewChecks } from "./security";
import { dependencyMatrixCheck, httpContractChecks } from "./contracts";
import type { AdmissionDependencyReferenceV1 } from "@bernouy/cms-integration-verification";
import type { DependencyMatrixExecution } from "../suites/dependencies";

export type PostgresAuditContext = Readonly<{
    loaded: LoadedSqlPackage;
    before: BoundarySnapshot;
    afterInstall: BoundarySnapshot;
    afterReapply: BoundarySnapshot;
    installedSchemas: readonly ObservedConnectorSchema[];
    reappliedSchemas: readonly ObservedConnectorSchema[];
    rls: RlsObservation;
    grants: readonly GrantObservation[];
    views: readonly ViewObservation[];
    routines: readonly RoutineObservation[];
}>;

export type PlannedPlatformSuite = Readonly<{
    suiteId: string;
    suiteDigest: string;
    applicable: boolean;
}>;

export async function buildPlatformEvidence(
    planned: readonly PlannedPlatformSuite[],
    loaded: LoadedSqlPackage,
    dependencies: readonly AdmissionDependencyReferenceV1[],
    context: PostgresAuditContext | undefined,
    dependencyExecutions: readonly DependencyMatrixExecution[] = [],
): Promise<PlatformVerificationEvidenceV1[]> {
    return await Promise.all(
        planned.map(async (entry) => {
            const definition = definitionFor(entry.suiteId);
            if (applies(definition, loaded) !== entry.applicable) {
                throw new TypeError(`Admission applicability is stale for ${entry.suiteId}`);
            }
            if (!entry.applicable) {
                return await notApplicableEvidence(definition, entry.suiteDigest);
            }
            if (definition.applicability !== "always" && !context) {
                return await failedSqlEvidence(definition, entry.suiteDigest);
            }
            return await applicableEvidence(
                definition,
                entry.suiteDigest,
                loaded,
                dependencies,
                context,
                dependencyExecutions,
            );
        }),
    );
}

function applies(definition: PlatformVerificationSuiteDefinitionV1, loaded: LoadedSqlPackage): boolean {
    if (definition.applicability === "always") {
        return true;
    }
    if (definition.applicability === "sql-connectors") {
        return loaded.connectors.length > 0;
    }
    return loaded.connectors.some((connector) => connector.dataApiSchemas.length > 0);
}

async function applicableEvidence(
    definition: PlatformVerificationSuiteDefinitionV1,
    suiteDigest: string,
    loaded: LoadedSqlPackage,
    dependencies: readonly AdmissionDependencyReferenceV1[],
    context: PostgresAuditContext | undefined,
    dependencyExecutions: readonly DependencyMatrixExecution[],
): Promise<PlatformVerificationEvidenceV1> {
    if (definition.suiteId === "platform-package-materialization") {
        const subject = {
            kind: loaded.definition.kind,
            version: loaded.definition.version,
            connectorCount: loaded.definition.connectors?.length ?? 0,
            sqlConnectorCount: loaded.connectors.length,
        };
        return suiteEvidence(definition, suiteDigest, [await checkEvidence("materialized-definition", subject, [])]);
    }
    if (definition.suiteId === "platform-declared-http-contracts") {
        return suiteEvidence(definition, suiteDigest, await httpContractChecks(loaded.definition));
    }
    if (definition.suiteId === "platform-dependency-matrix") {
        return suiteEvidence(
            definition,
            suiteDigest,
            await dependencyMatrixCheck(loaded.definition, dependencies, dependencyExecutions),
        );
    }
    if (!context) {
        throw new TypeError(`Applicable PostgreSQL suite ${definition.suiteId} has no audit context`);
    }
    if (definition.suiteId === "platform-postgres-install-reapply") {
        return suiteEvidence(definition, suiteDigest, await installChecks(context));
    }
    if (definition.suiteId === "platform-postgres-owned-roots") {
        return suiteEvidence(definition, suiteDigest, await boundaryChecks(context));
    }
    if (definition.suiteId === "platform-postgres-schema-contract") {
        return suiteEvidence(definition, suiteDigest, [await schemaContractCheck(context)]);
    }
    if (definition.suiteId === "platform-postgres-rls-shape") {
        return suiteEvidence(definition, suiteDigest, await rlsChecks(context.rls));
    }
    if (definition.suiteId === "platform-postgres-grants") {
        return suiteEvidence(definition, suiteDigest, await grantChecks(context.grants));
    }
    if (definition.suiteId === "platform-postgres-view-security") {
        return suiteEvidence(definition, suiteDigest, await viewChecks(context.views));
    }
    if (definition.suiteId === "platform-postgres-privileged-functions") {
        return suiteEvidence(definition, suiteDigest, await routineChecks(context.routines));
    }
    throw new TypeError(`PostgreSQL runner does not implement platform suite ${definition.suiteId}`);
}

function definitionFor(suiteId: string): PlatformVerificationSuiteDefinitionV1 {
    const definition = POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.find((entry) => entry.suiteId === suiteId);
    if (!definition) {
        throw new TypeError(`PostgreSQL runner does not recognize platform suite ${suiteId}`);
    }
    return definition;
}
