import { randomUUIDv7 } from "bun";
import type {
    AuthToken,
    AuthTokenPurpose,
    AuthTokenReservation,
    AuthTokenStore,
    NewAuthToken,
} from "cms-auth/tokens/one-time/interfaces/AuthTokenStore";
import { hashAuthToken, hashAuthTokenReservation, mintAuthToken } from "cms-auth/tokens/one-time/core/authToken";

type Record = AuthToken & {
    hash: string;
    reservationDigest?: string;
    reservation?: { id: string; expiresAt: Date };
};
const RESERVATION_MS = 5 * 60 * 1_000;

/**
 * In-memory auth token store for dev and tests. Stores only token hashes and
 * mirrors the one-shot semantics expected from the Mongo implementation.
 */
export class InMemoryAuthTokenStore implements AuthTokenStore {
    private _byId = new Map<string, Record>();
    private _idByHash = new Map<string, string>();

    async create(input: NewAuthToken): Promise<{ token: string; authToken: AuthToken }> {
        const token = mintAuthToken();
        const record: Record = {
            id: randomUUIDv7(),
            purpose: input.purpose,
            sub: input.sub,
            createdAt: new Date(),
            expiresAt: input.expiresAt,
            consumedAt: null,
            hash: hashAuthToken(token),
        };
        this._byId.set(record.id, record);
        this._idByHash.set(record.hash, record.id);
        return { token, authToken: strip(record) };
    }

    async findActive(purpose: AuthTokenPurpose, sub: string): Promise<AuthToken | null> {
        const now = Date.now();
        const record = [...this._byId.values()]
            .filter((r) => r.purpose === purpose && r.sub === sub && !r.consumedAt && r.expiresAt.getTime() > now)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return record ? strip(record) : null;
    }

    async consume(purpose: AuthTokenPurpose, token: string): Promise<AuthToken | null> {
        const reservation = await this.reserve(purpose, token, "compatibility-consume");
        return reservation ? this.finalize(reservation.id) : null;
    }

    async reserve(purpose: AuthTokenPurpose, token: string, operation: string): Promise<AuthTokenReservation | null> {
        const id = this._idByHash.get(hashAuthToken(token));
        const record = id ? this._byId.get(id) : undefined;
        if (!record || record.purpose !== purpose || record.consumedAt) {
            return null;
        }
        if (record.expiresAt.getTime() <= Date.now()) {
            return null;
        }
        if (record.reservation && record.reservation.expiresAt.getTime() > Date.now()) {
            return null;
        }
        const reservationDigest = hashAuthTokenReservation(token, purpose, operation);
        if (record.reservationDigest && record.reservationDigest !== reservationDigest) {
            return null;
        }
        const reservation = { id: randomUUIDv7(), expiresAt: new Date(Date.now() + RESERVATION_MS) };
        record.reservationDigest = reservationDigest;
        record.reservation = reservation;
        return { ...reservation, authToken: strip(record) };
    }

    async finalize(reservationId: string): Promise<AuthToken | null> {
        const record = [...this._byId.values()].find(
            (candidate) =>
                candidate.reservation?.id === reservationId && candidate.reservation.expiresAt.getTime() > Date.now(),
        );
        if (!record || record.consumedAt) {
            return null;
        }
        record.consumedAt = new Date();
        delete record.reservation;
        delete record.reservationDigest;
        return strip(record);
    }

    async release(reservationId: string): Promise<boolean> {
        const record = [...this._byId.values()].find((candidate) => candidate.reservation?.id === reservationId);
        if (!record || record.consumedAt) {
            return false;
        }
        delete record.reservation;
        return true;
    }

    async deleteForSub(sub: string, purpose?: AuthTokenPurpose): Promise<number> {
        let deleted = 0;
        for (const record of [...this._byId.values()]) {
            if (record.sub !== sub || (purpose && record.purpose !== purpose)) {
                continue;
            }
            this._byId.delete(record.id);
            this._idByHash.delete(record.hash);
            deleted++;
        }
        return deleted;
    }
}

function strip(record: Record): AuthToken {
    const { hash: _hash, reservation: _reservation, reservationDigest: _reservationDigest, ...token } = record;
    return { ...token };
}
