import { isDeepStrictEqual } from "node:util";
import { integrationVersionReleaseLevel, type DeclarativeArtifactTemplate } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";
import { compareSourceIndexing } from "./sourceIndexing";

type Source = Extract<DeclarativeArtifactTemplate, { type: "source" }>["source"];
type SourceEndpoint = Source["endpoints"][number];

export function compareSource(baseline: Source, candidate: Source, path: string, add: CompatibilityChangeSink): void {
    compareSourceIndexing(baseline.indexing, candidate.indexing, `${path}.indexing`, add);
    const previous = new Map(baseline.endpoints.map((endpoint) => [endpoint.endpointId, endpoint]));
    const next = new Map(candidate.endpoints.map((endpoint) => [endpoint.endpointId, endpoint]));
    for (const [id, endpoint] of previous) {
        const candidateEndpoint = next.get(id);
        const endpointPath = `${path}.endpoints.${id}`;
        if (!candidateEndpoint) {
            add(
                "breaking",
                "artifact",
                "source-endpoint-removed",
                endpointPath,
                "Source endpoint was removed or renamed",
            );
            continue;
        }
        compareSourceEndpoint(endpoint, candidateEndpoint, endpointPath, add);
    }
    for (const [id] of next) {
        if (!previous.has(id)) {
            add(
                "additive",
                "artifact",
                "source-endpoint-added",
                `${path}.endpoints.${id}`,
                "Source endpoint was added",
            );
        }
    }
}

function compareSourceEndpoint(
    baseline: SourceEndpoint,
    candidate: SourceEndpoint,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareContractVersion(baseline.contractVersion, candidate.contractVersion, `${path}.contractVersion`, add);
    if (baseline.method !== candidate.method) {
        add("breaking", "artifact", "endpoint-method-changed", path, "Source endpoint method changed");
    }
    compareAccess(baseline.access?.mode ?? "public", candidate.access?.mode ?? "public", `${path}.access`, add);
    const previousParams = new Map(baseline.params.map((param) => [param.name, param]));
    const nextParams = new Map(candidate.params.map((param) => [param.name, param]));
    for (const [name, param] of previousParams) {
        const candidateParam = nextParams.get(name);
        if (!candidateParam) {
            add(
                "breaking",
                "artifact",
                "endpoint-parameter-removed",
                `${path}.params.${name}`,
                "Endpoint parameter was removed or renamed",
            );
        } else if (
            param.in !== candidateParam.in ||
            param.type !== candidateParam.type ||
            (!param.required && candidateParam.required)
        ) {
            add(
                "breaking",
                "artifact",
                "endpoint-parameter-narrowed",
                `${path}.params.${name}`,
                "Endpoint parameter became more restrictive",
            );
        }
    }
    for (const [name, param] of nextParams) {
        if (!previousParams.has(name)) {
            add(
                param.required ? "breaking" : "additive",
                "artifact",
                param.required ? "required-endpoint-parameter-added" : "optional-endpoint-parameter-added",
                `${path}.params.${name}`,
                param.required ? "Required endpoint parameter was added" : "Optional endpoint parameter was added",
            );
        }
    }
    const previousRest = { body: baseline.body, output: baseline.output, headers: baseline.headers };
    const nextRest = { body: candidate.body, output: candidate.output, headers: candidate.headers };
    if (!isDeepStrictEqual(previousRest, nextRest)) {
        add(
            "unknown",
            "artifact",
            "endpoint-contract-unproven",
            path,
            "Endpoint body, response, or injected-header contract changed",
        );
    }
}

function compareContractVersion(
    baseline: string | undefined,
    candidate: string | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline === candidate) {
        return;
    }
    if (!baseline || !candidate) {
        add(
            "unknown",
            "artifact",
            "endpoint-contract-version-unproven",
            path,
            "Endpoint contract version was added or removed without a comparable baseline",
        );
        return;
    }
    const release = integrationVersionReleaseLevel(baseline, candidate);
    if (release === "major" || release === null) {
        add(
            "breaking",
            "artifact",
            "endpoint-contract-version-breaking",
            path,
            `Endpoint contract version changed from ${baseline} to ${candidate}`,
        );
        return;
    }
    add(
        "additive",
        "artifact",
        "endpoint-contract-version-advanced",
        path,
        `Endpoint contract version advanced from ${baseline} to ${candidate}`,
    );
}

function compareAccess(baseline: string, candidate: string, path: string, add: CompatibilityChangeSink): void {
    if (baseline === candidate) {
        return;
    }
    const order = ["public", "auth", "admin", "system"];
    const previous = order.indexOf(baseline);
    const next = order.indexOf(candidate);
    add(
        previous >= 0 && next >= 0 && next < previous ? "additive" : "breaking",
        "artifact",
        next < previous ? "endpoint-access-relaxed" : "endpoint-access-tightened",
        path,
        `Endpoint access changed from ${baseline} to ${candidate}`,
    );
}
