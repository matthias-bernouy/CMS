import { isDeepStrictEqual } from "node:util";
import type { DeclarativeArtifactTemplate, IntegrationDefinition } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";
import { compareSource } from "./source";

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
            return { source: artifact.bloc.source };
        case "trigger":
            return {
                event: artifact.trigger.event,
                mode: artifact.trigger.mode,
                failureMode: artifact.trigger.failureMode,
            };
        case "dashboard":
            return {
                source: artifact.dashboard.source,
                views: artifact.dashboard.views,
                requires: artifact.dashboard.requires,
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
