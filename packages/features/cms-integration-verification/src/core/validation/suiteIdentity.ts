import type {
    IntegrationVerificationAuthorSuiteType,
    IntegrationVerificationConformanceSuiteV1,
    IntegrationVerificationContractSuiteV1,
    IntegrationVerificationEnvelopeV1,
    IntegrationVerificationManifestV1,
    IntegrationVerificationSuiteContentV2,
} from "../../interfaces/verification";
import { INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA } from "../../interfaces/verification";
import { IntegrationVerificationContractError } from "./errors";
import { collectVerificationSuiteSourceClosure } from "./suiteSources";

export async function validateVerificationSuiteSources(envelope: IntegrationVerificationEnvelopeV1): Promise<void> {
    for (const suite of [...envelope.manifest.contracts, ...envelope.manifest.conformance]) {
        await collectVerificationSuiteSourceClosure(envelope.files, suite.entrypoint);
    }
    if (envelope.manifest.upgradeFixture) {
        await collectVerificationSuiteSourceClosure(envelope.files, envelope.manifest.upgradeFixture.entrypoint);
    }
}

export async function buildVerificationSuiteContent(
    envelope: IntegrationVerificationEnvelopeV1,
    type: IntegrationVerificationAuthorSuiteType,
    suiteId: string,
): Promise<IntegrationVerificationSuiteContentV2> {
    const suite = findAuthorSuite(envelope.manifest, type, suiteId);
    const sources = await collectVerificationSuiteSourceClosure(envelope.files, suite.entrypoint);
    return Object.freeze({
        schema: INTEGRATION_VERIFICATION_SUITE_CONTENT_SCHEMA,
        type,
        suite: Object.freeze({ ...suite }),
        sources: Object.freeze(
            sources.map(({ path, file }) => Object.freeze({ path, file: Object.freeze({ ...file }) })),
        ),
        fixtures: Object.freeze(
            envelope.manifest.fixtures.map((path) =>
                Object.freeze({ path, file: Object.freeze({ ...envelope.files[path]! }) }),
            ),
        ),
    });
}

function findAuthorSuite(
    manifest: IntegrationVerificationManifestV1,
    type: IntegrationVerificationAuthorSuiteType,
    suiteId: string,
): IntegrationVerificationContractSuiteV1 | IntegrationVerificationConformanceSuiteV1 {
    const suite =
        type === "contract"
            ? manifest.contracts.find((entry) => entry.contractId === suiteId)
            : manifest.conformance.find((entry) => entry.suiteId === suiteId);
    if (!suite) {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            `${type} suite ${JSON.stringify(suiteId)} is not declared by the verification manifest`,
            "manifest",
        );
    }
    return suite;
}
