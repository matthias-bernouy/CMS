import type { AdmittedContractRelease } from "../admission/admitContractRelease";
import { isReleaseDigest } from "../admission/digest";
import { parseFixtureAssets } from "../parsing/parseFixtureAssets";
import { parseIdentifier, parseSemVer } from "../parsing/identifiers";
import { assertIJson, canonicalIJsonBytes } from "../protocol/canonical";
import { ReleaseValidationError } from "../protocol/errors";
import { parseStrictJson } from "../protocol/json";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { deepFreeze, expectArray, expectRecord, expectString, rejectUnknownKeys } from "../protocol/values";
import type { ContractConformanceSuite, ConformanceScenario } from "../../interfaces/Conformance";
import { parseCoverageExemptions } from "./exemptions";
import { parseConformanceScenarios } from "./parseConformance";
import { parseDependencyProfiles } from "./dependencies/references";
import { resolveDependencyProfiles } from "./dependencies/resolveProfiles";

/** Parse against trusted admitted artifacts supplied by the caller; no dependency is fetched or inferred. */
export function parseConformanceSuite(
    value: unknown,
    admission: AdmittedContractRelease,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
    dependencies: readonly AdmittedContractRelease[] = [],
): ContractConformanceSuite {
    assertIJson(value, limits.maxJsonDepth);
    const record = expectRecord(value, "$", "invalid_contract");
    rejectUnknownKeys(
        record,
        [
            "kind",
            "protocol",
            "contractId",
            "contractVersion",
            "contractDigest",
            "publisherId",
            "version",
            "isolation",
            "scenarios",
            "fixtureAssets",
            "coverageExemptions",
            "dependencyProfiles",
        ],
        "$",
        "invalid_contract",
    );
    if (record.kind !== "contract-conformance-suite" || record.protocol !== "ulvia-conformance/v1") {
        throw new ReleaseValidationError("invalid_contract", "invalid conformance suite kind or protocol");
    }
    if (record.isolation !== "disposable-tenant") {
        throw new ReleaseValidationError(
            "invalid_contract",
            "conformance requires disposable-tenant isolation",
            "$.isolation",
        );
    }
    const contractId = parseIdentifier(record.contractId, "$.contractId", 96);
    const contractVersion = parseSemVer(record.contractVersion, "$.contractVersion");
    const publisherId = parseIdentifier(record.publisherId, "$.publisherId", 96);
    const contractDigest = expectString(record.contractDigest, "$.contractDigest", "invalid_contract", 71);
    if (!isReleaseDigest(contractDigest)) {
        throw new ReleaseValidationError("invalid_contract", "invalid contract digest", "$.contractDigest");
    }
    if (
        contractId !== admission.release.contractId ||
        contractVersion !== admission.release.version ||
        publisherId !== admission.release.publisherId ||
        contractDigest !== admission.digest
    ) {
        throw new ReleaseValidationError("invalid_contract", "suite does not match its admitted contract release");
    }
    const fixtureAssets = parseFixtureAssets(record.fixtureAssets, limits);
    const assetsById = new Map(fixtureAssets?.map((asset) => [asset.id, asset]));
    const referencedAssets = new Set<string>();
    const dependencyProfiles = parseDependencyProfiles(record.dependencyProfiles, limits);
    const selections = resolveDependencyProfiles(
        dependencyProfiles,
        record.scenarios,
        admission.release,
        dependencies,
        limits,
    );
    const parsed = new Map<string, ConformanceScenario>();
    for (const selection of selections) {
        const applicable = parseConformanceScenarios(
            selection.scenarios,
            admission.release.capabilities,
            assetsById,
            referencedAssets,
            limits,
            selection.selected,
        );
        for (const scenario of applicable) {
            parsed.set(scenario.id, scenario);
        }
    }
    const scenarios = expectArray(record.scenarios, "$.scenarios", "invalid_contract").map(
        (scenario) => parsed.get(expectRecord(scenario, "$.scenarios", "invalid_contract").id as string)!,
    );
    for (const asset of fixtureAssets ?? []) {
        if (!referencedAssets.has(asset.id)) {
            throw new ReleaseValidationError("invalid_contract", `unused fixture asset ${asset.id}`, "$.fixtureAssets");
        }
    }
    const coverageExemptions = parseCoverageExemptions(
        record.coverageExemptions,
        admission.release.capabilities,
        scenarios,
        limits,
    );
    const suite: ContractConformanceSuite = {
        kind: "contract-conformance-suite",
        protocol: "ulvia-conformance/v1",
        contractId,
        contractVersion,
        contractDigest,
        publisherId,
        version: parseSemVer(record.version, "$.version"),
        isolation: "disposable-tenant",
        scenarios,
        ...(dependencyProfiles === undefined ? {} : { dependencyProfiles }),
        ...(fixtureAssets === undefined ? {} : { fixtureAssets }),
        ...(coverageExemptions === undefined ? {} : { coverageExemptions }),
    };
    if (canonicalIJsonBytes(suite, limits.maxJsonDepth).byteLength > limits.maxDocumentBytes) {
        throw new ReleaseValidationError(
            "body_limit_exceeded",
            `canonical suite exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
    return deepFreeze(structuredClone(suite)) as ContractConformanceSuite;
}

export function parseConformanceSuiteJson(
    input: string | Uint8Array,
    admission: AdmittedContractRelease,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
    dependencies: readonly AdmittedContractRelease[] = [],
): ContractConformanceSuite {
    return parseConformanceSuite(
        parseStrictJson(input, limits.maxDocumentBytes, limits.maxJsonDepth),
        admission,
        limits,
        dependencies,
    );
}
