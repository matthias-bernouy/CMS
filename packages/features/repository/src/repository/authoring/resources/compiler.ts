import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveContractLineage } from "@bernouy/ulvia-contracts";
import { verifySpecialization } from "@bernouy/ulvia-contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import type { PublicationEnvelope } from "../../publication/types";
import type { CollectionPublisher } from "../CollectionAuthoring";
import type { AuthoringHost } from "../preparations/prepare";
import { prepareContractSource } from "./source/contract";
import { preparationCatalogue } from "./dependencies/catalogue";

export type AuthoredArtifactKind = "contract" | "provider-manifest";
export interface PreparedArtifact extends PublicationEnvelope {
    readonly kind: AuthoredArtifactKind;
    readonly digest: string;
    readonly publisherId: string;
    readonly id: string;
    readonly version: string;
}

export async function compileArtifact(
    host: AuthoringHost,
    publisher: CollectionPublisher,
    kind: AuthoredArtifactKind,
    directory: string,
): Promise<PreparedArtifact> {
    const catalogue = preparationCatalogue(host.contracts, publisher);
    if (kind === "contract") {
        const { admission } = await prepareContractSource(directory);
        const lineage = await resolveContractLineage(catalogue, admission.release);
        const parents = await Promise.all(
            lineage.slice(1).map((release) => catalogue.get(release.contractId, release.version)),
        );
        verifySpecialization(
            admission.release,
            parents.filter((parent) => parent !== null),
        );
        return {
            kind,
            digest: admission.digest,
            canonicalJson: admission.canonicalJson,
            publisherId: admission.release.publisherId,
            id: admission.release.contractId,
            version: admission.release.version,
            assets: [...(admission.fixtureAssets ?? []), ...(admission.documentationAssets ?? [])],
        };
    }
    const admission = await admitProviderManifestJson(
        await readFile(join(directory, "definition.json"), "utf8"),
        catalogue,
    );
    return {
        kind,
        digest: admission.digest,
        canonicalJson: admission.canonicalJson,
        publisherId: admission.manifest.provenance.publisherId,
        id: admission.manifest.providerId,
        version: admission.manifest.version,
        assets: [],
    };
}
