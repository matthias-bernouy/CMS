import { DEFAULT_INTEGRATION_PACKAGE_LIMITS } from "@bernouy/cms-integration-packages";
import {
    IntegrationRepositoryContractError,
    type IntegrationDefinitionIndex,
    type IntegrationDefinitionRepository,
} from "@bernouy/cms-integrations";
import type { PublicRepositoryRelease } from "@bernouy/cms-repository";
import type {
    RepositoryCatalogIntegrationSummary,
    RepositoryCatalogVersionContent,
    RepositoryCatalogVersionSummary,
} from "@bernouy/cms-repository/catalog";
import type { HttpRepositoryCompatibilityReader } from "../compatibility/reader";
import { BoundedCatalogWork, type RepositoryCatalogReaderLimits } from "../limits";
import type { HttpRepositoryReleaseReader } from "../release/reader";
import type { RepositoryCatalogHttpTransport, RepositoryPackageMetadata } from "../transport";
import { loadCatalogCompatibility, type LoadedCompatibility } from "./compatibilityHistory";
import { exactDefinition } from "./definitionCatalog";
import { artifactSummaries, compatibilitySummary, technicalProviders } from "./projection";

type LoadedVersion = Readonly<{
    summary: RepositoryCatalogVersionSummary;
    compatibility: LoadedCompatibility;
    release?: PublicRepositoryRelease;
    validators: readonly string[];
}>;

export type LoadedIntegration = Readonly<{
    summary: RepositoryCatalogIntegrationSummary;
    content?: RepositoryCatalogVersionContent;
    validators: readonly string[];
}>;

export type RepositoryCatalogLoaderConfig = Readonly<{
    catalog: IntegrationDefinitionRepository;
    transport: RepositoryCatalogHttpTransport;
    compatibility: HttpRepositoryCompatibilityReader;
    releases: HttpRepositoryReleaseReader;
    limits: RepositoryCatalogReaderLimits;
}>;

export class RepositoryCatalogLoader {
    constructor(private readonly config: RepositoryCatalogLoaderConfig) {}

    async load(
        index: IntegrationDefinitionIndex,
        work: BoundedCatalogWork,
        contentVersion?: string,
    ): Promise<LoadedIntegration> {
        const versions = await Promise.all(
            index.versions.map(({ version }) => this.loadVersion(index.kind, version, work)),
        );
        const featured = featuredVersion(index);
        const definitionVersions = [...new Set([featured, ...(contentVersion ? [contentVersion] : [])])];
        const definitions = new Map(
            await Promise.all(
                definitionVersions.map(
                    async (version) =>
                        [version, await exactDefinition(this.config.catalog, work, index.kind, version)] as const,
                ),
            ),
        );
        const featuredDefinition = definitions.get(featured)!;
        const featuredResources = versions.find(({ summary }) => summary.version === featured)!;
        const summary: RepositoryCatalogIntegrationSummary = {
            kind: index.kind,
            label: index.label,
            ...(index.description ? { description: index.description } : {}),
            ...(index.category ? { category: index.category } : {}),
            ...(index.stable ? { stable: index.stable } : {}),
            ...(index.latest ? { latest: index.latest } : {}),
            technicalProviders: technicalProviders(featuredDefinition),
            artifacts: artifactSummaries(featuredDefinition),
            compatibility: compatibilitySummary(featuredResources.compatibility.history),
            versions: versions.map(({ summary: version }) => version),
        };
        const validators = versions.flatMap(({ validators: values }) => values);
        if (!contentVersion) {
            return { summary, validators };
        }
        const resources = versions.find(({ summary: version }) => version.version === contentVersion)!;
        const notes = await work.run(() =>
            this.config.transport.getText(
                endpoint("release-notes", index.kind, contentVersion),
                this.config.limits.releaseNotesBytes,
            ),
        );
        if (notes) {
            validators.push(`notes:${index.kind}@${contentVersion}:${notes.etag}`);
        }
        return {
            summary,
            content: {
                version: contentVersion,
                definition: definitions.get(contentVersion)!,
                ...(resources.summary.package ? { package: resources.summary.package } : {}),
                ...(notes ? { releaseNotes: notes.value } : {}),
                ...(resources.compatibility.history ? { compatibility: resources.compatibility.history } : {}),
                ...(resources.release ? { release: resources.release } : {}),
            },
            validators,
        };
    }

    private async loadVersion(kind: string, version: string, work: BoundedCatalogWork): Promise<LoadedVersion> {
        const [packageMetadata, compatibility, releaseDocument] = await Promise.all([
            work.run(() =>
                this.config.transport.headPackage(
                    endpoint("package", kind, version),
                    DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes,
                ),
            ),
            loadCatalogCompatibility(this.config.compatibility, this.config.limits, kind, version, work),
            work.run(() => this.config.releases.getDocument(kind, version)),
        ]);
        assertDigestAgreement(packageMetadata, compatibility);
        if (packageMetadata && releaseDocument && packageMetadata.digest !== releaseDocument.value.packageDigest) {
            throw new IntegrationRepositoryContractError();
        }
        const release = releaseDocument?.value;
        return {
            summary: {
                version,
                ...(packageMetadata
                    ? { package: { digest: packageMetadata.digest, canonicalBytes: packageMetadata.canonicalBytes } }
                    : {}),
                ...(compatibility.history ? { compatibility: compatibilitySummary(compatibility.history) } : {}),
                ...(release
                    ? {
                          release: {
                              status: release.status,
                              installable: release.installable,
                              freshInstallOnly: release.freshInstallOnly,
                              ...(release.verificationDigest ? { verificationDigest: release.verificationDigest } : {}),
                              ...(release.verification
                                  ? {
                                        verificationOrigin: release.verification.origin,
                                        verificationOutcome: release.verification.outcome,
                                    }
                                  : {}),
                          },
                      }
                    : {}),
            },
            compatibility,
            ...(release ? { release } : {}),
            validators: [
                ...(packageMetadata ? [`package:${kind}@${version}:${packageMetadata.etag}`] : []),
                ...compatibility.validators,
                ...(releaseDocument ? [`release:${kind}@${version}:${releaseDocument.etag}`] : []),
            ],
        };
    }
}

export function featuredVersion(index: IntegrationDefinitionIndex): string {
    return index.stable ?? index.latest ?? index.versions[0]!.version;
}

function endpoint(resource: "package" | "release-notes", kind: string, version: string): string {
    return `api/integrations/${resource}?${new URLSearchParams({ kind, version }).toString()}`;
}

function assertDigestAgreement(metadata: RepositoryPackageMetadata | null, compatibility: LoadedCompatibility): void {
    if (metadata && compatibility.history && compatibility.history.admission.packageDigest !== metadata.digest) {
        throw new IntegrationRepositoryContractError();
    }
}
