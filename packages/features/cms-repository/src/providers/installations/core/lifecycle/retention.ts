import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type {
    ProviderInstallationCandidate,
    ProviderInstallationScope,
    ProviderInstallationWorkflowOptions,
    StoredProviderInstallation,
} from "../../interfaces/ProviderInstallationStore";
import { ProviderInstallationWorkflowError } from "./errors";

/** A public Repository never infers usage. The owning Provider supplies authoritative site evidence. */
export async function checkProviderRetention(
    current: StoredProviderInstallation,
    candidate: ProviderInstallationCandidate,
    catalogue: ProviderManifestCatalogue,
    retention: ProviderInstallationWorkflowOptions["retention"],
): Promise<Readonly<{ scope: ProviderInstallationScope; revision: string }> | null> {
    const [before, after] = await Promise.all([
        catalogue.get(current.installation.providerId, current.installation.approval.manifestVersion),
        catalogue.get(candidate.providerId, candidate.manifestVersion),
    ]);
    if (!before || !after || after.admission.digest !== candidate.manifestDigest) {
        throw new ProviderInstallationWorkflowError("manifest_unavailable", "Manifest retention cannot be verified");
    }
    const required = before.admission.manifest.implementations.filter(
        (previous) =>
            !after.admission.manifest.implementations.some(
                (next) =>
                    previous.contractId === next.contractId &&
                    previous.version === next.version &&
                    previous.digest === next.digest,
            ),
    );
    if (!required.length) {
        return null;
    }
    const scope = { siteId: candidate.siteId, installationId: candidate.id };
    const evidence = await retention?.snapshot(scope);
    if (!evidence?.complete) {
        throw new ProviderInstallationWorkflowError(
            "retention_unknown",
            "Exact release usage is unknown; the Provider manifest cannot drop releases",
        );
    }
    const blocked = required.filter((release) =>
        evidence.releases.some(
            (pin) =>
                pin.contractId === release.contractId &&
                pin.version === release.version &&
                pin.digest === release.digest,
        ),
    );
    if (blocked.length) {
        throw new ProviderInstallationWorkflowError(
            "release_in_use",
            `Provider manifest drops required releases: ${blocked.map(({ contractId, version }) => `${contractId}@${version}`).join(", ")}`,
        );
    }
    return { scope, revision: evidence.revision };
}
