import type {
    PlatformVerificationFindingV1,
    PlatformVerificationCheckEvidenceV1,
} from "@bernouy/cms-integration-verification";
import { checkEvidence, finding } from "../evidence";
import type { GrantObservation, RlsObservation, RoutineObservation, ViewObservation } from "../types";

const UNPRIVILEGED = new Set(["PUBLIC", "anon", "authenticated"]);

export async function rlsChecks(observation: RlsObservation): Promise<PlatformVerificationCheckEvidenceV1[]> {
    const missing = observation.relations
        .filter((relation) => !relation.rlsEnabled)
        .map((relation) => finding("postgres-rls-disabled", `${relation.namespace}.${relation.relation}`));
    const unsafe = observation.policies.flatMap(policyFindings);
    return await Promise.all([
        checkEvidence("rls-enabled", observation.relations, missing),
        checkEvidence("policy-shape", observation.policies, unsafe),
    ]);
}

export async function grantChecks(
    observation: readonly GrantObservation[],
): Promise<PlatformVerificationCheckEvidenceV1[]> {
    const findings = observation.flatMap((grant) => {
        if (!UNPRIVILEGED.has(grant.grantee)) {
            return [];
        }
        const path = `${grant.namespace}.${grant.objectName}:${grant.grantee}:${grant.privilege}`;
        if (grant.grantable) {
            return [finding("postgres-unprivileged-grant-option", path)];
        }
        if (grant.grantee === "PUBLIC") {
            return [finding("postgres-public-object-privilege", path)];
        }
        if (grant.objectType === "schema" && grant.privilege === "CREATE") {
            return [finding("postgres-data-api-schema-create", path)];
        }
        if (grant.objectType === "relation" && ["TRUNCATE", "TRIGGER", "REFERENCES"].includes(grant.privilege)) {
            return [finding("postgres-data-api-elevated-relation-privilege", path)];
        }
        return [];
    });
    return [await checkEvidence("data-api-grants", observation, findings)];
}

export async function viewChecks(
    observation: readonly ViewObservation[],
): Promise<PlatformVerificationCheckEvidenceV1[]> {
    const findings = observation.flatMap((view) => {
        if (!view.selectGrantees.some((role) => UNPRIVILEGED.has(role))) {
            return [];
        }
        if (view.kind === "materialized-view") {
            return [finding("postgres-materialized-view-data-api-exposure", `${view.namespace}.${view.name}`)];
        }
        return view.securityInvoker
            ? []
            : [finding("postgres-view-security-definer-exposure", `${view.namespace}.${view.name}`)];
    });
    return [await checkEvidence("invoker-or-unexposed", observation, findings)];
}

export async function routineChecks(
    observation: readonly RoutineObservation[],
): Promise<PlatformVerificationCheckEvidenceV1[]> {
    const hardening: PlatformVerificationFindingV1[] = [];
    const exposure: PlatformVerificationFindingV1[] = [];
    for (const routine of observation) {
        if (!routine.securityDefiner) {
            continue;
        }
        const path = `${routine.namespace}.${routine.identity}`;
        if (!safeSearchPath(routine.configuration)) {
            hardening.push(finding("postgres-security-definer-unsafe-search-path", path));
        }
        if (routine.executeGrantees.some((role) => UNPRIVILEGED.has(role))) {
            exposure.push(finding("postgres-security-definer-unprivileged-execute", path));
        }
    }
    return await Promise.all([
        checkEvidence("security-definer-hardening", observation, hardening),
        checkEvidence("execution-exposure", observation, exposure),
    ]);
}

function policyFindings(policy: RlsObservation["policies"][number]): PlatformVerificationFindingV1[] {
    if (!policy.roles.some((role) => UNPRIVILEGED.has(role))) {
        return [];
    }
    const path = `${policy.namespace}.${policy.relation}.${policy.name}`;
    const findings: PlatformVerificationFindingV1[] = [];
    if (["r", "w", "d", "*"].includes(policy.command) && !policy.usingExpression) {
        findings.push(finding("postgres-policy-missing-using", path));
    }
    if (policy.command === "a" && !policy.checkExpression) {
        findings.push(finding("postgres-policy-missing-with-check", path));
    }
    const expression = `${policy.usingExpression ?? ""}\n${policy.checkExpression ?? ""}`.toLowerCase();
    if (expression.includes("raw_user_meta_data") || expression.includes("user_metadata")) {
        findings.push(finding("postgres-policy-user-metadata-authorization", path));
    }
    if (/\bauth\.role\s*\(/u.test(expression)) {
        findings.push(finding("postgres-policy-deprecated-auth-role", path));
    }
    return findings;
}

function safeSearchPath(configuration: readonly string[]): boolean {
    const setting = configuration.find((entry) => entry.startsWith("search_path="));
    if (!setting) {
        return false;
    }
    const value = setting.slice("search_path=".length).replaceAll('"', "").trim();
    if (value === "") {
        return true;
    }
    const entries = value.split(",").map((entry) => entry.trim().toLowerCase());
    return entries.every((entry) => entry === "pg_catalog") && entries.length > 0;
}
