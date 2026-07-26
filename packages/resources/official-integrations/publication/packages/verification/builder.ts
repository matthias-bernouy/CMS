import { canonicalJsonBytes, decodeIntegrationPackageFile, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    validateIntegrationVerificationEnvelope,
    type IntegrationVerificationEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import { OFFICIAL_INTEGRATIONS_ROOT } from "../../../index";
import type { BuiltOfficialIntegrationPackage } from "../../contracts";
import { buildOfficialIntegrationPackages } from "../runtime";
import type { BuiltOfficialIntegrationVerification, OfficialIntegrationVerificationBackfill } from "./contracts";
import {
    OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
    OFFICIAL_PACKAGE_AUDIT_RUNNER_REQUIREMENT,
    OFFICIAL_SQL_BACKFILL_RUNNER_REQUIREMENT,
    OFFICIAL_VERIFICATION_BACKFILL_SCHEMA,
} from "./contracts";
import { loadOfficialVerificationBackfillIndex } from "./loader";
import {
    parseOfficialVerificationBackfillIndex,
    selectOfficialVerificationBackfillPackages,
} from "./validation";

const PHOTO_ALBUMS_LEGACY_TEST_PATH = "fixtures/legacy-test-ownership.v1.json";
const PHOTO_ALBUMS_LEGACY_SUITES = Object.freeze([
    {
        suiteId: "photo-albums-blocs",
        sourcePath: "tests/blocs.test.ts",
        intendedType: "conformance",
        blockers: ["package-relative-runtime-assets", "workspace-package-imports"],
    },
    {
        suiteId: "photo-albums-definition",
        sourcePath: "tests/definition.test.ts",
        intendedType: "contract",
        blockers: ["package-relative-runtime-assets", "workspace-package-imports"],
    },
] as const);

export async function buildOfficialIntegrationVerificationBackfill(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<OfficialIntegrationVerificationBackfill> {
    const loadedIndex = await loadOfficialVerificationBackfillIndex(requestedRoot);
    const packages = selectOfficialVerificationBackfillPackages(
        await buildOfficialIntegrationPackages(requestedRoot),
        loadedIndex.index,
    );
    const verifications = await Promise.all(packages.map(buildVerification));
    const index = parseOfficialVerificationBackfillIndex({
        schema: OFFICIAL_VERIFICATION_BACKFILL_SCHEMA,
        verificationPolicy: OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
        entries: verifications.map(({ kind, version, packageDigest, verificationDigest }) => ({
            kind,
            version,
            packageDigest,
            verificationDigest,
        })),
    });
    const indexCanonicalBytes = canonicalJsonBytes(index);
    if ((await sha256Hex(indexCanonicalBytes)) !== loadedIndex.indexDigest) {
        throw new Error("Generated official verification backfill differs from its immutable index");
    }
    return {
        index,
        indexDigest: await sha256Hex(indexCanonicalBytes),
        indexCanonicalBytes,
        verifications,
    };
}

async function buildVerification(
    integrationPackage: BuiltOfficialIntegrationPackage,
): Promise<BuiltOfficialIntegrationVerification> {
    const legacyOwnership = await photoAlbumsLegacyOwnership(integrationPackage);
    const envelope = validateIntegrationVerificationEnvelope({
        schema: "cms.integration.verification.v1",
        target: {
            kind: integrationPackage.kind,
            version: integrationPackage.version,
            packageDigest: integrationPackage.digest,
        },
        manifest: {
            runnerRequirements: [
                hasSqlConnector(integrationPackage)
                    ? OFFICIAL_SQL_BACKFILL_RUNNER_REQUIREMENT
                    : OFFICIAL_PACKAGE_AUDIT_RUNNER_REQUIREMENT,
            ],
            contracts: [],
            conformance: [],
            fixtures: legacyOwnership ? [PHOTO_ALBUMS_LEGACY_TEST_PATH] : [],
        },
        files: legacyOwnership
            ? {
                  [PHOTO_ALBUMS_LEGACY_TEST_PATH]: {
                      encoding: "utf8",
                      content: new TextDecoder().decode(canonicalJsonBytes(legacyOwnership)),
                  },
              }
            : {},
    } satisfies IntegrationVerificationEnvelopeV1);
    const canonicalBytes = canonicalJsonBytes(envelope);
    return {
        kind: integrationPackage.kind,
        version: integrationPackage.version,
        packageDigest: integrationPackage.digest,
        verificationDigest: await computeIntegrationVerificationDigest(envelope),
        envelope,
        canonicalBytes,
    };
}

function hasSqlConnector(integrationPackage: BuiltOfficialIntegrationPackage): boolean {
    return (integrationPackage.definition.connectors ?? []).some(
        (connector) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0,
    );
}

async function photoAlbumsLegacyOwnership(
    integrationPackage: BuiltOfficialIntegrationPackage,
): Promise<Record<string, unknown> | null> {
    if (integrationPackage.kind !== "photo-albums" || integrationPackage.version !== "1.0.0") {
        return null;
    }
    const suites = await Promise.all(
        PHOTO_ALBUMS_LEGACY_SUITES.map(async (suite) => {
            const file = integrationPackage.package.envelope.files[suite.sourcePath];
            if (!file) {
                throw new Error(`Published Photo Albums package lost legacy test ${suite.sourcePath}`);
            }
            return {
                suiteId: suite.suiteId,
                sourcePath: suite.sourcePath,
                sourceDigest: await sha256Hex(decodeIntegrationPackageFile(file)),
                intendedType: suite.intendedType,
                portability: "workspace-coupled",
                blockers: suite.blockers,
            };
        }),
    );
    return {
        schema: "cms.integration.verification.legacy-test-ownership.v1",
        disposition: "documented-not-executed",
        publishedPackageBytes: "retained",
        suites,
    };
}
