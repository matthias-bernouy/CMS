import type {
    DeclarativeConnectorLegacyAdoptionBaseline,
    IntegrationConnectorSchemaBaselineReader,
    ResolvedConnectorLegacyAdoptionBaseline,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { IntegrationRuntimeError } from "../../../errors";
import {
    identifyObservedSchemaContract,
    materializeObservedSchemaContract,
} from "../../../parsing/templates/connector-compatibility";

type ConnectorIdentity = Readonly<{
    provider: string;
    connectorKey?: string;
    lineageId?: string;
}>;

export async function resolveReviewedLegacyBaseline(input: {
    reader: IntegrationConnectorSchemaBaselineReader;
    integrationKind: string;
    connector: ConnectorIdentity;
    reference: DeclarativeConnectorLegacyAdoptionBaseline;
}): Promise<ResolvedConnectorLegacyAdoptionBaseline> {
    const connectorKey = input.connector.connectorKey!;
    const lineageId = input.connector.lineageId!;
    const baselines = await input.reader.listForPackage(
        input.integrationKind,
        input.reference.definitionVersion,
        input.reference.packageDigest,
    );
    const matches = baselines.filter((baseline) => sameSelector(baseline.connector, input.reference.baselineSelector));
    if (matches.length === 0) {
        throw new IntegrationRuntimeError(
            `reviewed legacy schema baseline is unavailable for ${input.integrationKind}@${input.reference.definitionVersion}/${connectorKey}`,
            503,
        );
    }
    if (matches.length !== 1) {
        throw new IntegrationRuntimeError("repository returned ambiguous legacy schema baselines", 502);
    }
    const reviewed = matches[0]!;
    if (
        reviewed.packageDigest !== input.reference.packageDigest ||
        reviewed.connector.provider !== input.connector.provider
    ) {
        throw new IntegrationRuntimeError("repository legacy schema baseline does not match the target reference", 502);
    }
    const observedSchema = materializeObservedSchemaContract(reviewed.schema, { connectorKey, lineageId });
    const observedSchemaDigest = (await identifyObservedSchemaContract(observedSchema)).digest;
    if (observedSchemaDigest !== input.reference.observedSchemaDigest) {
        throw new IntegrationRuntimeError(
            "repository legacy schema baseline projection failed integrity validation",
            502,
        );
    }
    return { ...input.reference, observedSchema };
}

function sameSelector(
    left: Readonly<{ provider: string; root?: string }>,
    right: Readonly<{ provider: string; root?: string }>,
): boolean {
    return left.provider === right.provider && left.root === right.root;
}
