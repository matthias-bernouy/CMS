import { InvalidIdentityError } from "./errors";
import {
    CMS_IDENTITY_AUTHORITY,
    type IdentityAlias,
    type IdentityAuthority,
    type IdentitySubjectId,
    type IdentityValue,
} from "../interfaces/Identity";

export function normalizeIdentityAlias(alias: IdentityAlias): IdentityAlias {
    if (!alias || typeof alias !== "object") {
        throw new InvalidIdentityError("Identity alias is required");
    }
    if (alias.kind !== "user") {
        throw new InvalidIdentityError("Identity alias kind is invalid");
    }

    const authority = normalizeAuthority(alias.authority, "Identity alias authority is required");
    if (typeof alias.value === "string") {
        if (!alias.value.trim()) {
            throw new InvalidIdentityError("Identity alias value is required");
        }
    } else if (typeof alias.value !== "number" || !Number.isFinite(alias.value)) {
        throw new InvalidIdentityError("Identity alias value must be a finite string or number");
    }
    return { authority, kind: alias.kind, value: alias.value };
}

export function normalizeBindableIdentityAlias(alias: IdentityAlias): IdentityAlias {
    const normalized = normalizeIdentityAlias(alias);
    if (normalized.authority === CMS_IDENTITY_AUTHORITY) {
        throw new InvalidIdentityError("CMS identity authority is reserved");
    }
    return normalized;
}

export function normalizeCmsIdentitySubjectId(value: IdentityValue): IdentitySubjectId {
    if (typeof value !== "string") {
        throw new InvalidIdentityError("CMS identity alias must contain a string subject id");
    }
    return normalizeIdentitySubjectId(value);
}

export function normalizeIdentitySubjectId(subjectId: IdentitySubjectId): IdentitySubjectId {
    if (typeof subjectId !== "string" || !subjectId.trim()) {
        throw new InvalidIdentityError("Identity subject id is required");
    }
    return subjectId.trim();
}

export function normalizeTargetAuthority(authority: IdentityAuthority): IdentityAuthority {
    return normalizeAuthority(authority, "Target identity authority is required");
}

function normalizeAuthority(authority: IdentityAuthority, message: string): IdentityAuthority {
    if (typeof authority !== "string" || !authority.trim()) {
        throw new InvalidIdentityError(message);
    }
    return authority.trim();
}
