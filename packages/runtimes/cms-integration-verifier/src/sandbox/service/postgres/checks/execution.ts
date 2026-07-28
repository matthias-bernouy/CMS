import type {
    PlatformVerificationEvidenceV1,
    PlatformVerificationFindingV1,
    PlatformVerificationSuiteDefinitionV1,
} from "@bernouy/cms-integration-verification";
import { projectedObservedDigest } from "../application";
import { checkEvidence, finding, suiteEvidence } from "../evidence";
import type { BoundarySnapshot, ObservedConnectorSchema } from "../types";
import type { PostgresAuditContext } from ".";

export async function installChecks(context: PostgresAuditContext) {
    const installed = context.installedSchemas.map(schemaIdentity);
    const reapplied = context.reappliedSchemas.map(schemaIdentity);
    const drift = installed.flatMap((entry) => {
        const next = reapplied.find((candidate) => candidate.connectorKey === entry.connectorKey);
        return next?.observedDigest === entry.observedDigest
            ? []
            : [finding("postgres-reapply-changed-schema", entry.connectorKey)];
    });
    return await Promise.all([
        checkEvidence("clean-install", installed, []),
        checkEvidence("same-database-reapply", reapplied, []),
        checkEvidence("schema-idempotence", { installed, reapplied }, drift),
    ]);
}

export async function boundaryChecks(context: PostgresAuditContext) {
    return await Promise.all([
        checkEvidence(
            "install-boundary",
            { before: context.before.digest, after: context.afterInstall.digest },
            boundaryFindings(context.before, context.afterInstall),
        ),
        checkEvidence(
            "reapply-boundary",
            { before: context.afterInstall.digest, after: context.afterReapply.digest },
            boundaryFindings(context.afterInstall, context.afterReapply),
        ),
    ]);
}

export async function schemaContractCheck(context: PostgresAuditContext) {
    const subjects = await Promise.all(
        context.installedSchemas.map(async (schema) => ({
            connectorKey: schema.connectorKey,
            declaredDigest: schema.declaredDigest,
            projectedObservedDigest: await projectedObservedDigest(schema),
        })),
    );
    const findings = subjects.flatMap((subject) =>
        subject.declaredDigest === subject.projectedObservedDigest
            ? []
            : [finding("postgres-observed-schema-contract-mismatch", subject.connectorKey)],
    );
    return await checkEvidence("declared-observed-consistency", subjects, findings);
}

export async function failedSqlEvidence(
    definition: PlatformVerificationSuiteDefinitionV1,
    suiteDigest: string,
): Promise<PlatformVerificationEvidenceV1> {
    const checks = await Promise.all(
        definition.checks.map(async (checkId) =>
            checkEvidence(checkId, { execution: "rejected" }, [
                finding("postgres-package-sql-rejected", "package.sql"),
            ]),
        ),
    );
    return suiteEvidence(definition, suiteDigest, checks);
}

function boundaryFindings(before: BoundarySnapshot, after: BoundarySnapshot): PlatformVerificationFindingV1[] {
    const left = new Map(before.rows.map((row) => [rowKey(row), row.definition]));
    const right = new Map(after.rows.map((row) => [rowKey(row), row.definition]));
    return [...new Set([...left.keys(), ...right.keys()])].flatMap((key) =>
        left.get(key) === right.get(key) ? [] : [finding("postgres-mutation-outside-owned-roots", key)],
    );
}

function schemaIdentity(schema: ObservedConnectorSchema) {
    return {
        connectorKey: schema.connectorKey,
        lineageId: schema.lineageId,
        observedDigest: schema.observedDigest,
    };
}

function rowKey(row: BoundarySnapshot["rows"][number]): string {
    return `${row.objectType}:${row.namespace}.${row.identity}`;
}
