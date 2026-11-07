export const CMS_IDENTITY_AUTHORITY = "cms";

export type IdentityAuthority = string;
export type IdentityKind = "user";
export type IdentitySubjectId = string;
export type IdentityValue = string | number;

export type IdentityAlias = Readonly<{
    authority: IdentityAuthority;
    kind: IdentityKind;
    value: IdentityValue;
}>;

export interface IdentityResolver {
    resolve(alias: IdentityAlias, targetAuthority: IdentityAuthority): Promise<IdentityValue | null>;
}

export interface IdentityBinder {
    bind(subjectId: IdentitySubjectId, alias: IdentityAlias): Promise<void>;
}

export interface IdentityService extends IdentityResolver, IdentityBinder {}
