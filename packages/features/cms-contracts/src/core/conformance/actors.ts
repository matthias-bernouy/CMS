import type { CapabilityAccess } from "../../interfaces/ContractRelease";
import type { ConformanceActor } from "../../interfaces/Conformance";
import { parseIdentifier } from "../parsing/identifiers";
import { ReleaseValidationError } from "../protocol/errors";
import { expectRecord, rejectUnknownKeys } from "../protocol/values";

export function parseActor(value: unknown, path: string, access: CapabilityAccess): ConformanceActor {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["kind", "label"], path, "invalid_contract");
    if (record.kind === "admin") {
        if (Object.hasOwn(record, "label")) {
            throw new ReleaseValidationError("invalid_contract", "admin actor has no label", path);
        }
        return { kind: "admin" };
    }
    if (record.kind === "authenticated") {
        if (access === "admin") {
            throw new ReleaseValidationError(
                "invalid_contract",
                "authenticated actor cannot call admin capability",
                path,
            );
        }
        return { kind: "authenticated", label: parseIdentifier(record.label, `${path}.label`, 64) };
    }
    if (record.kind === "public") {
        if (Object.hasOwn(record, "label") || access !== "public") {
            throw new ReleaseValidationError(
                "invalid_contract",
                "public actor requires public capability and no label",
                path,
            );
        }
        return { kind: "public" };
    }
    throw new ReleaseValidationError(
        "invalid_contract",
        "actor kind must be admin, authenticated, or public",
        `${path}.kind`,
    );
}
