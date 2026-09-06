import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import {
    integrationVersionReleaseLevel,
    isIntegrationPrerelease,
    type IntegrationDefinition,
    type IntegrationDefinitionIndex,
} from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import {
    IntegrationRegistryVersionConflictError,
    IntegrationRegistryVersionOrderError,
} from "../../../../core/publication/errors";

export function nextIntegrationRegistryIndex(
    previous: IntegrationDefinitionIndex | null,
    definition: IntegrationDefinition,
    envelope: IntegrationPackageEnvelopeV1,
    options: Readonly<{
        status?: "blocked" | "inadmissible" | "unverified";
        verificationDigest?: string;
        advanceChannels?: boolean;
    }> = {},
): IntegrationDefinitionIndex {
    const { kind, version } = envelope;
    if (previous?.versions.some((entry) => entry.version === version)) {
        throw new IntegrationRegistryVersionConflictError(kind, version);
    }
    const advanceChannels = options.advanceChannels ?? true;
    if (!previous && advanceChannels && isIntegrationPrerelease(version)) {
        throw new TypeError("The first published version of an integration must be eligible for the stable channel");
    }
    for (const published of previous?.versions ?? []) {
        if (!integrationVersionReleaseLevel(published.version, version)) {
            throw new IntegrationRegistryVersionOrderError(kind, version, published.version);
        }
    }
    const nextVersion = {
        version,
        path: `versions/${version}`,
        definition: `versions/${version}/${envelope.definition}`,
        ...(options.verificationDigest ? { verificationDigest: options.verificationDigest } : {}),
        ...(options.status ? { status: options.status } : {}),
    };
    return parseIntegrationDefinitionIndex(
        {
            schema: "cms.integration.index.v1",
            kind,
            label: definition.label,
            ...(definition.icon ? { icon: definition.icon } : {}),
            ...(definition.cover ? { cover: definition.cover } : {}),
            ...(definition.category ? { category: definition.category } : {}),
            ...(definition.description ? { description: definition.description } : {}),
            ...(advanceChannels ? { stable: previous?.stable ?? version, latest: version } : {}),
            ...(!advanceChannels && previous?.stable ? { stable: previous.stable } : {}),
            ...(!advanceChannels && previous?.latest ? { latest: previous.latest } : {}),
            versions: [...(previous?.versions ?? []), nextVersion],
        },
        `publication:${kind}@${version}`,
    );
}
