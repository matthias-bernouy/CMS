import type { Collection, Db } from "mongodb";
import { IdentityAliasConflictError } from "../core/errors";
import { aliasKey, sameIdentityValue, subjectAuthorityKey } from "../core/keys";
import {
    normalizeBindableIdentityAlias,
    normalizeCmsIdentitySubjectId,
    normalizeIdentityAlias,
    normalizeIdentitySubjectId,
    normalizeTargetAuthority,
} from "../core/validation";
import {
    CMS_IDENTITY_AUTHORITY,
    type IdentityAlias,
    type IdentityKind,
    type IdentityService,
    type IdentitySubjectId,
    type IdentityValue,
} from "../interfaces/Identity";

type IdentityAliasDoc = {
    subjectId: IdentitySubjectId;
    authority: string;
    kind: IdentityKind;
    value: IdentityValue;
    aliasKey: string;
    subjectAuthorityKey: string;
};

export class MongoIdentityService implements IdentityService {
    private readonly collection: Collection<IdentityAliasDoc>;

    constructor(db: Db, collectionName = "cms_identity_aliases") {
        this.collection = db.collection<IdentityAliasDoc>(collectionName);
    }

    async init(): Promise<void> {
        await this.collection.createIndex({ aliasKey: 1 }, { unique: true });
        await this.collection.createIndex({ subjectAuthorityKey: 1 }, { unique: true });
    }

    async bind(subjectId: IdentitySubjectId, candidate: IdentityAlias): Promise<void> {
        const subject = normalizeIdentitySubjectId(subjectId);
        const alias = normalizeBindableIdentityAlias(candidate);
        const doc: IdentityAliasDoc = {
            subjectId: subject,
            authority: alias.authority,
            kind: alias.kind,
            value: alias.value,
            aliasKey: aliasKey(alias),
            subjectAuthorityKey: subjectAuthorityKey(subject, alias),
        };

        try {
            await this.collection.updateOne(
                { subjectAuthorityKey: doc.subjectAuthorityKey },
                { $setOnInsert: doc },
                { upsert: true },
            );
        } catch (error) {
            if (!isDuplicateKey(error)) {
                throw error;
            }
        }

        const stored = await this.collection.findOne({ subjectAuthorityKey: doc.subjectAuthorityKey });
        if (!isSameBinding(stored, doc)) {
            throw new IdentityAliasConflictError();
        }
    }

    async resolve(candidate: IdentityAlias, candidateTargetAuthority: string): Promise<IdentityValue | null> {
        const alias = normalizeIdentityAlias(candidate);
        const targetAuthority = normalizeTargetAuthority(candidateTargetAuthority);
        const cmsSubjectId =
            alias.authority === CMS_IDENTITY_AUTHORITY ? normalizeCmsIdentitySubjectId(alias.value) : undefined;
        if (alias.authority === targetAuthority) {
            return cmsSubjectId ?? alias.value;
        }

        const subjectId = cmsSubjectId ?? (await this.collection.findOne({ aliasKey: aliasKey(alias) }))?.subjectId;
        if (!subjectId) {
            return null;
        }
        if (targetAuthority === CMS_IDENTITY_AUTHORITY) {
            return subjectId;
        }
        return (
            (
                await this.collection.findOne({
                    subjectAuthorityKey: subjectAuthorityKey(subjectId, {
                        authority: targetAuthority,
                        kind: alias.kind,
                    }),
                })
            )?.value ?? null
        );
    }
}

function isSameBinding(stored: IdentityAliasDoc | null, candidate: IdentityAliasDoc): boolean {
    return (
        stored !== null &&
        stored.subjectId === candidate.subjectId &&
        stored.authority === candidate.authority &&
        stored.kind === candidate.kind &&
        stored.aliasKey === candidate.aliasKey &&
        stored.subjectAuthorityKey === candidate.subjectAuthorityKey &&
        sameIdentityValue(stored.value, candidate.value)
    );
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
