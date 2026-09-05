import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { integrationVersionSatisfies, type IntegrationDefinition } from "@bernouy/cms-integrations";
import type { AdmissionDependencyReferenceV1 } from "@bernouy/cms-integration-verification";
import type { DependencyMatrixExecution } from "../suites/dependencies";
import { checkEvidence, finding } from "../evidence";
import { connectorFunctionTarget, provisionFunctionCoverage } from "./functionReferences";

export async function httpContractChecks(definition: IntegrationDefinition) {
    const subjects = await Promise.all(
        (definition.connectors ?? []).flatMap((connector, connectorIndex) =>
            (connector.functions ?? []).map(async (fn) => {
                const path = `connectors.${connector.connectorKey ?? connectorIndex}.functions.${fn.name}`;
                return {
                    path,
                    ...(fn.compatibility?.http
                        ? { contractDigest: await sha256Hex(canonicalJsonBytes(fn.compatibility.http)) }
                        : {}),
                };
            }),
        ),
    );
    const findings = subjects.flatMap((subject) =>
        subject.contractDigest ? [] : [finding("function-http-contract-missing", subject.path)],
    );
    return await Promise.all([
        checkEvidence("function-contract-declarations", subjects.toSorted(comparePath), findings),
        sourceEndpointCoverage(definition),
        provisionFunctionCoverage(definition),
    ]);
}

export async function dependencyMatrixCheck(
    definition: IntegrationDefinition,
    references: readonly AdmissionDependencyReferenceV1[],
    executions: readonly DependencyMatrixExecution[],
) {
    const declared = new Map((definition.dependencies ?? []).map((dependency) => [dependency.kind, dependency]));
    const findings = references.flatMap((reference) => {
        const dependency = declared.get(reference.kind);
        if (!reference.selection) {
            return [finding("dependency-selection-missing", `dependencies.${reference.kind}@${reference.version}`)];
        }
        if (dependency?.versionRange && !integrationVersionSatisfies(reference.version, dependency.versionRange)) {
            return [
                finding("dependency-resolution-outside-range", `dependencies.${reference.kind}.${reference.selection}`),
            ];
        }
        return [];
    });
    for (const dependency of definition.dependencies ?? []) {
        const selected = references.filter((reference) => reference.kind === dependency.kind);
        if (!dependency.versionRange) {
            findings.push(finding("dependency-version-range-missing", `dependencies.${dependency.kind}`));
        }
        if (dependency.optional && selected.length === 0) {
            continue;
        }
        for (const selection of ["minimum", "stable"] as const) {
            const count = selected.filter((reference) => reference.selection === selection).length;
            if (count !== 1) {
                findings.push(
                    finding(
                        count === 0 ? "dependency-resolution-missing" : "dependency-resolution-ambiguous",
                        `dependencies.${dependency.kind}.${selection}`,
                    ),
                );
            }
        }
    }
    const subjects = references.map((reference) => ({
        selection: reference.selection ?? "legacy",
        kind: reference.kind,
        version: reference.version,
        packageDigest: reference.packageDigest,
        direct: declared.has(reference.kind),
    }));
    return await Promise.all([
        checkEvidence("exact-resolution-points", subjects, findings),
        executionCheck("minimum", references, executions),
        executionCheck("stable", references, executions),
    ]);
}

async function executionCheck(
    selection: "minimum" | "stable",
    references: readonly AdmissionDependencyReferenceV1[],
    executions: readonly DependencyMatrixExecution[],
) {
    const expected = references.filter((reference) => reference.selection === selection);
    const selected = executions.filter((execution) => execution.selection === selection);
    const execution = selected[0];
    const findings: ReturnType<typeof finding>[] = [];
    if (expected.length === 0 && selected.length === 0) {
        return await checkEvidence(`${selection}-package-execution`, [], []);
    }
    if (selected.length !== 1 || !execution) {
        findings.push(finding("dependency-matrix-execution-missing", `dependencies.${selection}`));
    } else {
        const expectedIdentities = expected.map(referenceIdentity).toSorted();
        const executedIdentities = execution.packages.map(referenceIdentity).toSorted();
        if (
            expectedIdentities.length !== executedIdentities.length ||
            expectedIdentities.some((identity, index) => identity !== executedIdentities[index])
        ) {
            findings.push(finding("dependency-matrix-execution-substituted", `dependencies.${selection}`));
        }
        if (execution.outcome === "failed" && execution.failure) {
            findings.push(finding(execution.failure.code, execution.failure.path));
        }
    }
    return await checkEvidence(
        `${selection}-package-execution`,
        execution ? [{ ...execution, outcome: execution.outcome }] : [],
        findings,
    );
}

function referenceIdentity(reference: Readonly<{ kind: string; version: string; packageDigest: string }>): string {
    return `${reference.kind}\0${reference.version}\0${reference.packageDigest}`;
}

function comparePath(left: Readonly<{ path: string }>, right: Readonly<{ path: string }>): number {
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

async function sourceEndpointCoverage(definition: IntegrationDefinition) {
    const functions = new Map<
        string,
        NonNullable<NonNullable<IntegrationDefinition["connectors"]>[number]["functions"]>
    >();
    for (const connector of definition.connectors ?? []) {
        for (const fn of connector.functions ?? []) {
            functions.set(fn.name, [...(functions.get(fn.name) ?? []), fn]);
        }
    }
    const subjects = (definition.artifacts ?? []).flatMap((artifact) =>
        artifact.type === "source"
            ? artifact.source.endpoints.flatMap((endpoint) => {
                  const target = connectorFunctionTarget(endpoint.targetUrl);
                  if (!target) {
                      return [];
                  }
                  const matches = functions.get(target.functionName) ?? [];
                  const contract =
                      matches.length === 1
                          ? matches[0]?.compatibility?.http?.endpoints.find(
                                (entry) => entry.method === endpoint.method && entry.route === target.route,
                            )
                          : undefined;
                  return [
                      {
                          path: `artifacts.sources.${artifact.source.id}.endpoints.${endpoint.endpointId}`,
                          functionName: target.functionName,
                          method: endpoint.method,
                          route: target.route,
                          functionMatches: matches.length,
                          contractMatched: Boolean(contract),
                      },
                  ];
              })
            : [],
    );
    const findings = subjects.flatMap((subject) => {
        if (subject.functionMatches === 0) {
            return [finding("source-endpoint-function-missing", subject.path)];
        }
        if (subject.functionMatches > 1) {
            return [finding("source-endpoint-function-ambiguous", subject.path)];
        }
        return subject.contractMatched ? [] : [finding("source-endpoint-http-contract-missing", subject.path)];
    });
    return await checkEvidence("source-endpoint-coverage", subjects.toSorted(comparePath), findings);
}
