import { isDeepStrictEqual } from "node:util";
import type { DeclarativeArtifactTemplate, IntegrationDefinition } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";
import { compareAccess, compareContractVersion, compareSource } from "./source";

export function compareDefinitionArtifacts(
    baseline: IntegrationDefinition,
    candidate: IntegrationDefinition,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map((baseline.artifacts ?? []).map((artifact) => [artifactIdentity(artifact), artifact]));
    const next = new Map((candidate.artifacts ?? []).map((artifact) => [artifactIdentity(artifact), artifact]));
    for (const [identity, artifact] of previous) {
        const candidateArtifact = next.get(identity);
        const path = `artifacts.${identity}`;
        if (!candidateArtifact) {
            add("breaking", "artifact", "artifact-removed", path, "Artifact was removed or renamed");
        } else {
            compareArtifact(artifact, candidateArtifact, path, add);
        }
    }
    for (const [identity] of next) {
        if (!previous.has(identity)) {
            add("additive", "artifact", "artifact-added", `artifacts.${identity}`, "Artifact was added");
        }
    }
}

function compareArtifact(
    baseline: DeclarativeArtifactTemplate,
    candidate: DeclarativeArtifactTemplate,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline.type !== candidate.type) {
        add("breaking", "artifact", "artifact-type-changed", path, "Artifact type changed");
        return;
    }
    if (baseline.type === "source" && candidate.type === "source") {
        compareSource(baseline.source, candidate.source, path, add);
        return;
    }
    if (baseline.type === "bloc" && candidate.type === "bloc") {
        compareBlocVisibility(baseline.bloc.internal === true, candidate.bloc.internal === true, path, add);
        return;
    }
    if (baseline.type === "dashboard-view" && candidate.type === "dashboard-view") {
        compareDashboardView(baseline, candidate, path, add);
        return;
    }
    if (baseline.type === "function" && candidate.type === "function") {
        compareFunction(baseline, candidate, path, add);
        return;
    }
    const previousContract = publicArtifactContract(baseline);
    const nextContract = publicArtifactContract(candidate);
    if (!isDeepStrictEqual(previousContract, nextContract)) {
        add(
            "unknown",
            "artifact",
            "artifact-contract-changed",
            path,
            "Declared artifact contract changed without a specialized comparator",
        );
    }
}

function compareFunction(
    baseline: Extract<DeclarativeArtifactTemplate, { type: "function" }>,
    candidate: Extract<DeclarativeArtifactTemplate, { type: "function" }>,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareContractVersion(baseline.contractVersion, candidate.contractVersion, `${path}.contractVersion`, add);
    if (baseline.function.method !== candidate.function.method) {
        add("breaking", "artifact", "function-method-changed", `${path}.method`, "Function method changed");
    }
    compareAccess(
        baseline.function.access?.mode ?? "public",
        candidate.function.access?.mode ?? "public",
        `${path}.access`,
        add,
    );
    const previousDataContract = { input: baseline.function.input, output: baseline.function.output };
    const nextDataContract = { input: candidate.function.input, output: candidate.function.output };
    if (!isDeepStrictEqual(previousDataContract, nextDataContract)) {
        add(
            "unknown",
            "artifact",
            "function-data-contract-unproven",
            path,
            "Function input or output changed without a specialized data-shape comparison",
        );
    }
}

function compareDashboardView(
    baseline: Extract<DeclarativeArtifactTemplate, { type: "dashboard-view" }>,
    candidate: Extract<DeclarativeArtifactTemplate, { type: "dashboard-view" }>,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previousContract = publicArtifactContract(baseline);
    const nextContract = publicArtifactContract(candidate);
    if (isDeepStrictEqual(previousContract, nextContract)) {
        return;
    }
    if (isStructuralExtension(previousContract, nextContract)) {
        add("additive", "artifact", "dashboard-view-extended", path, "Dashboard view was extended");
        return;
    }
    add(
        "unknown",
        "artifact",
        "artifact-contract-changed",
        path,
        "Dashboard view changed incompatibly or without comparable stable identities",
    );
}

function isStructuralExtension(baseline: unknown, candidate: unknown): boolean {
    if (isDeepStrictEqual(baseline, candidate)) {
        return true;
    }
    if (Array.isArray(baseline) && Array.isArray(candidate)) {
        return isArrayExtension(baseline, candidate);
    }
    if (!isRecord(baseline) || !isRecord(candidate)) {
        return false;
    }
    return Object.entries(baseline).every(
        ([key, value]) => Object.hasOwn(candidate, key) && isStructuralExtension(value, candidate[key]),
    );
}

function isArrayExtension(baseline: readonly unknown[], candidate: readonly unknown[]): boolean {
    const previousById = indexByStableId(baseline);
    const nextById = indexByStableId(candidate);
    if (previousById && nextById) {
        return [...previousById].every(([id, value]) => {
            const next = nextById.get(id);
            return next !== undefined && isStructuralExtension(value, next);
        });
    }
    let candidateIndex = 0;
    for (const value of baseline) {
        while (candidateIndex < candidate.length && !isDeepStrictEqual(value, candidate[candidateIndex])) {
            candidateIndex += 1;
        }
        if (candidateIndex >= candidate.length) {
            return false;
        }
        candidateIndex += 1;
    }
    return true;
}

function indexByStableId(values: readonly unknown[]): Map<string, Record<string, unknown>> | null {
    const entries: [string, Record<string, unknown>][] = [];
    for (const value of values) {
        if (!isRecord(value) || typeof value.id !== "string" || !value.id) {
            return null;
        }
        entries.push([value.id, value]);
    }
    const result = new Map(entries);
    return result.size === entries.length ? result : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareBlocVisibility(
    baselineInternal: boolean,
    candidateInternal: boolean,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baselineInternal === candidateInternal) {
        return;
    }
    const madePublic = baselineInternal && !candidateInternal;
    add(
        madePublic ? "additive" : "breaking",
        "artifact",
        madePublic ? "bloc-made-public" : "bloc-made-internal",
        `${path}.internal`,
        madePublic ? "Bloc became publicly selectable" : "Public bloc became internal",
    );
}

function publicArtifactContract(artifact: DeclarativeArtifactTemplate): unknown {
    switch (artifact.type) {
        case "function":
            return {
                contractVersion: artifact.contractVersion,
                method: artifact.function.method,
                access: artifact.function.access,
                input: artifact.function.input,
                output: artifact.function.output,
            };
        case "bloc":
            return undefined;
        case "trigger":
            return {
                event: artifact.trigger.event,
                mode: artifact.trigger.mode,
                failureMode: artifact.trigger.failureMode,
            };
        case "dashboard":
            return {
                homeView: artifact.dashboard.homeView,
                views: artifact.dashboard.views,
                status: artifact.dashboard.status,
            };
        case "dashboard-view":
            return {
                source: artifact.view.source,
                view: artifact.view.view,
                availability: artifact.view.availability,
                requires: artifact.view.requires,
            };
        case "sourceOverlay":
            return artifact.overlay;
        case "relation":
            return {
                from: artifact.relation.from,
                to: artifact.relation.to,
                cardinality: artifact.relation.cardinality,
                binding: artifact.relation.binding,
                page: artifact.relation.page,
            };
        case "dashboardRelation":
            return artifact.projection;
        case "source":
            return undefined;
    }
}

function artifactIdentity(artifact: DeclarativeArtifactTemplate): string {
    switch (artifact.type) {
        case "source":
            return `source:${artifact.source.id}`;
        case "dashboard":
            return `dashboard:${artifact.dashboard.id}`;
        case "dashboard-view":
            return `dashboard-view:${artifact.view.id}`;
        case "sourceOverlay":
            return `sourceOverlay:${artifact.overlay.id}`;
        case "relation":
            return `relation:${artifact.relation.id}`;
        case "dashboardRelation":
            return `dashboardRelation:${artifact.projection.relationId}:${artifact.projection.dashboardId}:${artifact.projection.viewId}`;
        case "function":
            return `function:${artifact.function.id}`;
        case "trigger":
            return `trigger:${artifact.trigger.id}`;
        case "bloc":
            return `bloc:${artifact.bloc.tag}`;
    }
}
