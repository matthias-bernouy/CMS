export type PublicRepositoryReadResource =
    | "integrations"
    | "integration-index"
    | "integration-versions"
    | "integration-definition"
    | "integration-asset"
    | "integration-compatibility"
    | "integration-package"
    | "integration-release-notes";

export type PublicRepositoryReadObservation = Readonly<{
    resource: PublicRepositoryReadResource;
    method: "GET" | "HEAD";
    status: number;
    durationMs: number;
}>;

export type PublicRepositoryReadObserver = (observation: PublicRepositoryReadObservation) => void;

export function observePublicRepositoryRead(
    observer: PublicRepositoryReadObserver | undefined,
    observation: PublicRepositoryReadObservation,
): void {
    try {
        observer?.(observation);
    } catch {
        // Telemetry must never change anonymous repository availability.
    }
}
