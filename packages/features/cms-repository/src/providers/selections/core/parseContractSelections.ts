import type { ReleaseDigest } from "cms-repository/exports/contracts/index";
import { canonicalIJsonBytes, deepFreeze, parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { parseDigest, parseOpaqueId } from "cms-repository/providers/installations/core/parsing/fields";
import { parseIdentifier } from "cms-repository/providers/manifests/core/parsing/identifiers";
import {
    compareOrdinal,
    expectArray,
    expectRecord,
    rejectUnknownKeys,
} from "cms-repository/providers/manifests/core/values";
import { parseSemVer } from "cms-repository/providers/manifests/core/versioning/versionRange";
import type { ContractSelection } from "../interfaces/ContractSelection";
import { ContractSelectionValidationError, translateSelectionError } from "./errors";
import { DEFAULT_CONTRACT_SELECTION_LIMITS, type ContractSelectionLimits, selectionLimits } from "./limits";

export function parseContractSelections(
    value: unknown,
    limits: Readonly<ContractSelectionLimits> = DEFAULT_CONTRACT_SELECTION_LIMITS,
): readonly ContractSelection[] {
    const bounds = selectionLimits(limits);
    try {
        if (Array.isArray(value) && value.length > bounds.maxSelections) {
            throw new ContractSelectionValidationError("limit_exceeded", "too many selections");
        }
        expectArray(value, "$", bounds.maxSelections);
        if (canonicalIJsonBytes(value, bounds.maxJsonDepth).byteLength > bounds.maxDocumentBytes) {
            throw new ContractSelectionValidationError("limit_exceeded", "selection document exceeds byte limit");
        }
        const seen = new Set<string>();
        const selections = expectArray(structuredClone(value), "$", bounds.maxSelections).map((entry, index) => {
            const path = `$[${index}]`;
            const record = expectRecord(entry, path);
            rejectUnknownKeys(record, ["siteId", "contractId", "version", "digest", "installationId"], path);
            const selection = {
                siteId: parseOpaqueId(record.siteId, `${path}.siteId`),
                contractId: parseIdentifier(record.contractId, `${path}.contractId`),
                version: parseSemVer(record.version, `${path}.version`),
                digest: parseDigest(record.digest, `${path}.digest`) as ReleaseDigest,
                installationId: parseOpaqueId(record.installationId, `${path}.installationId`),
            };
            const key = `${selection.siteId}/${selection.contractId}`;
            if (seen.has(key)) {
                throw new ContractSelectionValidationError("duplicate_selection", "duplicate site/contract pair", path);
            }
            seen.add(key);
            return selection;
        });
        selections.sort(
            (left, right) =>
                compareOrdinal(left.siteId, right.siteId) || compareOrdinal(left.contractId, right.contractId),
        );
        return deepFreeze(selections);
    } catch (error) {
        return translateSelectionError(error);
    }
}

export function parseContractSelectionsJson(
    input: string | Uint8Array,
    limits: Readonly<ContractSelectionLimits> = DEFAULT_CONTRACT_SELECTION_LIMITS,
): readonly ContractSelection[] {
    const bounds = selectionLimits(limits);
    try {
        return parseContractSelections(parseStrictJson(input, bounds.maxDocumentBytes, bounds.maxJsonDepth), bounds);
    } catch (error) {
        return translateSelectionError(error);
    }
}

export function parseSelectionSiteId(value: unknown): string {
    try {
        return parseOpaqueId(value, "$.siteId");
    } catch (error) {
        return translateSelectionError(error);
    }
}
