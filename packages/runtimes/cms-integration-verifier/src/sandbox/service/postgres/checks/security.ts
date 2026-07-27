import type {
    PlatformVerificationFindingV1,
    PlatformVerificationCheckEvidenceV1,
} from "@bernouy/cms-integration-verification";
import { checkEvidence, finding } from "../evidence";
import type {
    GrantObservation,
    RlsObservation,
    RoleMembershipObservation,
    RoutineObservation,
    UnknownSurfaceObservation,
    ViewObservation,
} from "../types";

const UNPRIVILEGED = new Set(["PUBLIC", "anon", "authenticated"]);

export async function rlsChecks(observation: RlsObservation): Promise<PlatformVerificationCheckEvidenceV1[]> {
    const exposed = observation.relations.filter((relation) => relation.exposedRoles.length > 0);
    const exposedPaths = new Set(exposed.map((relation) => `${relation.namespace}.${relation.relation}`));
    const missing = exposed.flatMap((relation) => {
        const path = `${relation.namespace}.${relation.relation}`;
        return [
            ...(relation.rlsEnabled ? [] : [finding("postgres-rls-disabled", path)]),
            ...(relation.rlsForced ? [] : [finding("postgres-rls-not-forced", path)]),
        ];
    });
    const exposedPolicies = observation.policies.filter((policy) =>
        exposedPaths.has(`${policy.namespace}.${policy.relation}`),
    );
    const unsafe = exposedPolicies.flatMap(policyFindings);
    return await Promise.all([
        checkEvidence("rls-enabled", exposed, missing),
        checkEvidence("policy-shape", exposedPolicies, unsafe),
    ]);
}

export async function grantChecks(
    observation: readonly GrantObservation[],
    memberships: readonly RoleMembershipObservation[],
    unknownSurfaces: readonly UnknownSurfaceObservation[],
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
        if (grant.objectType === "column" && grant.privilege === "REFERENCES") {
            return [finding("postgres-data-api-elevated-column-privilege", path)];
        }
        return [];
    });
    findings.push(
        ...memberships.map((membership) =>
            finding(
                membership.superuser || membership.bypassRls
                    ? "postgres-data-api-privileged-role-membership"
                    : "postgres-data-api-unexpected-role-membership",
                `${membership.actor}:${membership.inheritedRole}:${membership.depth}`,
            ),
        ),
        ...unknownSurfaces.map((surface) =>
            finding("postgres-unknown-data-api-surface", `${surface.namespace}.${surface.objectName}:${surface.kind}`),
        ),
    );
    return [await checkEvidence("data-api-grants", { grants: observation, memberships, unknownSurfaces }, findings)];
}

export async function viewChecks(
    observation: readonly ViewObservation[],
): Promise<PlatformVerificationCheckEvidenceV1[]> {
    const findings = observation.flatMap((view) => {
        if (!view.selectGrantees.some((role) => UNPRIVILEGED.has(role))) {
            return [];
        }
        if (!view.ownedBySessionRole) {
            return [finding("postgres-view-external-owner", `${view.namespace}.${view.name}`)];
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
        if (!routine.ownedBySessionRole) {
            hardening.push(finding("postgres-security-definer-external-owner", path));
        }
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
    if (["a", "w", "*"].includes(policy.command) && !policy.checkExpression) {
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
