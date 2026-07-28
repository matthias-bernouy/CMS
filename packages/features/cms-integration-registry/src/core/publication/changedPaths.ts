import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";

export function changedIntegrationPackagePaths(
    baseline: IntegrationPackageEnvelopeV1,
    candidate: IntegrationPackageEnvelopeV1,
): readonly string[] {
    const paths = new Set([...Object.keys(baseline.files), ...Object.keys(candidate.files)]);
    return [...paths].filter((path) => fileChanged(baseline, candidate, path)).sort(compareText);
}

function fileChanged(
    baseline: IntegrationPackageEnvelopeV1,
    candidate: IntegrationPackageEnvelopeV1,
    path: string,
): boolean {
    const previous = baseline.files[path];
    const next = candidate.files[path];
    return !previous || !next || previous.encoding !== next.encoding || previous.content !== next.content;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
