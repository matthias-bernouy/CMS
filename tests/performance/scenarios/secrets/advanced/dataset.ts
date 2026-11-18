import { requireRecord, assertCondition } from "../../queries/types";
import type { secretFixture } from "../fixture";

export const SECRET_READ_VOLUME = 100;
export const SECRET_KEY_HISTORY = 64;
export type SecretState = Pick<Awaited<ReturnType<typeof secretFixture>>, "secret" | "credentials" | "fixture">;

/** Both lists retain 100 live metadata records; history also retains 64 real revoked key records. */
export async function secretReadDataset(state: SecretState, history: boolean) {
    const records = [state.secret!];
    for (let index = 1; index < SECRET_READ_VOLUME; index++) {
        records.push(
            requireRecord(
                await state.fixture("secrets.create", {
                    ...state.credentials,
                    name: `row-${String(index).padStart(3, "0")}`,
                    value: `private-${crypto.randomUUID()}`,
                }),
            ),
        );
    }
    let active = requireRecord(
        await state.fixture("namespace.keys.create", {
            ...state.credentials,
            permissions: ["namespace.manage", "secrets.metadata.read", "secrets.resolve"],
        }),
    );
    const original = active.namespaceKey;
    if (history) {
        for (let index = 0; index < SECRET_KEY_HISTORY; index++) {
            active = requireRecord(
                await state.fixture("namespace.keys.rotate", { ...state.credentials, keyId: active.keyId }),
            );
        }
        let record = state.secret!;
        for (let index = 0; index < 8; index++) {
            record = requireRecord(
                await state.fixture("secrets.rotate", {
                    ...state.credentials,
                    secretId: record.secretId,
                    expectedVersion: record.version,
                    value: `history-${index}-${crypto.randomUUID()}`,
                }),
            );
        }
        records[0] = record;
        assertCondition(record.version === 9);
    }
    return {
        records,
        credentials: { ...state.credentials, namespaceKey: active.namespaceKey },
        revokedKey: history ? original : undefined,
    };
}
