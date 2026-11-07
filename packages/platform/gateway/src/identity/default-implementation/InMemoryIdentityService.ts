import { IdentityAliasConflictError } from "cms-gateway/identity/core/errors";
import { aliasKey, sameIdentityValue, subjectAuthorityKey } from "cms-gateway/identity/core/keys";
import {
    normalizeBindableIdentityAlias,
    normalizeCmsIdentitySubjectId,
    normalizeIdentityAlias,
    normalizeIdentitySubjectId,
    normalizeTargetAuthority,
} from "cms-gateway/identity/core/validation";
import {
    CMS_IDENTITY_AUTHORITY,
    type IdentityAlias,
    type IdentityService,
    type IdentitySubjectId,
    type IdentityValue,
} from "cms-gateway/identity/interfaces/Identity";

export class InMemoryIdentityService implements IdentityService {
    private readonly subjectByAlias = new Map<string, IdentitySubjectId>();
    private readonly aliasBySubjectAuthority = new Map<string, IdentityValue>();

    async bind(subjectId: IdentitySubjectId, candidate: IdentityAlias): Promise<void> {
        const subject = normalizeIdentitySubjectId(subjectId);
        const alias = normalizeBindableIdentityAlias(candidate);
        const existingSubject = this.subjectByAlias.get(aliasKey(alias));
        if (existingSubject !== undefined && existingSubject !== subject) {
            throw new IdentityAliasConflictError();
        }

        const subjectKey = subjectAuthorityKey(subject, alias);
        const existingAlias = this.aliasBySubjectAuthority.get(subjectKey);
        if (existingAlias !== undefined && !sameIdentityValue(existingAlias, alias.value)) {
            throw new IdentityAliasConflictError();
        }

        this.subjectByAlias.set(aliasKey(alias), subject);
        this.aliasBySubjectAuthority.set(subjectKey, alias.value);
    }

    async resolve(candidate: IdentityAlias, candidateTargetAuthority: string): Promise<IdentityValue | null> {
        const alias = normalizeIdentityAlias(candidate);
        const targetAuthority = normalizeTargetAuthority(candidateTargetAuthority);
        const cmsSubjectId =
            alias.authority === CMS_IDENTITY_AUTHORITY ? normalizeCmsIdentitySubjectId(alias.value) : undefined;
        if (alias.authority === targetAuthority) {
            return cmsSubjectId ?? alias.value;
        }

        const subjectId = cmsSubjectId ?? this.subjectByAlias.get(aliasKey(alias));
        if (!subjectId) {
            return null;
        }
        if (targetAuthority === CMS_IDENTITY_AUTHORITY) {
            return subjectId;
        }
        return (
            this.aliasBySubjectAuthority.get(
                subjectAuthorityKey(subjectId, {
                    authority: targetAuthority,
                    kind: alias.kind,
                }),
            ) ?? null
        );
    }
}
