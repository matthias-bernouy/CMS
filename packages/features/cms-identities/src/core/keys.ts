import type { IdentityAlias, IdentitySubjectId, IdentityValue } from "../interfaces/Identity";

export function aliasKey(alias: IdentityAlias): string {
    return JSON.stringify([alias.authority, alias.kind, typeof alias.value, normalizeNumber(alias.value)]);
}

export function subjectAuthorityKey(subjectId: IdentitySubjectId, alias: Pick<IdentityAlias, "authority" | "kind">): string {
    return JSON.stringify([subjectId, alias.authority, alias.kind]);
}

export function sameIdentityValue(left: IdentityValue, right: IdentityValue): boolean {
    return typeof left === typeof right && Object.is(normalizeNumber(left), normalizeNumber(right));
}

function normalizeNumber(value: IdentityValue): IdentityValue {
    return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}
