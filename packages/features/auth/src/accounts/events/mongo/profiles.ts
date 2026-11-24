import type { Db } from "mongodb";
import type { FieldCrypto, EncryptedBlob } from "@bernouy/envelope-crypto";
import { z } from "zod";
import type { EmailVerificationEvidence, AccountEventProfile } from "../interfaces";
import { verificationEvidence } from "../intent";
type Profile = { _id: string; createdAt: Date; accessAccountReference?: string; emailEnc?: EncryptedBlob };
const reference = z.string().uuid();
/** Registration is an explicit new Event-reference operation, never an old-account creation backfill. */
export async function prepareEmailProof(
    db: Db,
    prefix: string,
    accountId: string,
    createdAt: string,
    method: EmailVerificationEvidence["method"],
): Promise<EmailVerificationEvidence> {
    verificationEvidence.parse({ method, accountCreatedAt: createdAt });
    const users = db.collection<Profile>(`${prefix}users`, {
        readConcern: { level: "majority" },
        writeConcern: { w: "majority", j: true },
    });
    const filter = { _id: accountId, createdAt: new Date(createdAt) };
    const current = await users.findOne(filter, { projection: { accessAccountReference: 1 } });
    if (!current) {
        throw new TypeError("Account Event member unavailable");
    }
    if (current.accessAccountReference !== undefined) {
        return { method, accountCreatedAt: createdAt, accountRef: reference.parse(current.accessAccountReference) };
    }
    const candidate = crypto.randomUUID();
    await users.updateOne(
        { ...filter, accessAccountReference: { $exists: false } },
        { $set: { accessAccountReference: candidate } },
    );
    const confirmed = await users.findOne(filter, { projection: { accessAccountReference: 1 } });
    return { method, accountCreatedAt: createdAt, accountRef: reference.parse(confirmed?.accessAccountReference) };
}
export async function readEventProfile(
    db: Db,
    prefix: string,
    accountRef: string,
    crypto?: FieldCrypto,
): Promise<AccountEventProfile | null> {
    const row = await db
        .collection<Profile>(`${prefix}users`, { readConcern: { level: "majority" } })
        .findOne(
            { accessAccountReference: reference.parse(accountRef) },
            { projection: { _id: 0, emailEnc: 1, createdAt: 1 }, hint: { accessAccountReference: 1 }, maxTimeMS: 2000 },
        );
    if (!row) {
        return null;
    }
    if (row.emailEnc && !crypto) {
        throw new TypeError("Account profile crypto required");
    }
    return {
        createdAt: row.createdAt.toISOString(),
        ...(row.emailEnc ? { email: await crypto!.decrypt(row.emailEnc) } : {}),
    };
}
