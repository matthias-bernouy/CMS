import { afterEach, describe, expect, test } from "bun:test";
import type { CmsSyncTarget } from "@bernouy/cms-content/bindings";
import { readSyncValue, subscribeSyncValue, writeSyncValue } from "../../../src/browser/binding/params/SyncState";

const page = { scope: "page", key: "ulvia-official-editor" } satisfies CmsSyncTarget;
const session = { scope: "session", key: "ulvia-official-session" } satisfies CmsSyncTarget;
const persistent = { scope: "persistent", key: "ulvia-official-preferences" } satisfies CmsSyncTarget;

afterEach(() => {
    writeSyncValue(page, undefined);
    writeSyncValue(session, undefined);
    writeSyncValue(persistent, undefined);
});

describe("synchronized state", () => {
    test("stores structured page values and notifies matching subscribers", () => {
        const values: unknown[] = [];
        const stop = subscribeSyncValue(page, (value) => values.push(value));
        const value = { selected: "home", dirty: false };

        writeSyncValue(page, value);

        expect(readSyncValue(page)).toBe(value);
        expect(values).toEqual([value]);
        stop();
    });

    test("persists versioned structured values in session and persistent storage", () => {
        writeSyncValue(session, { tab: "pages" });
        writeSyncValue(persistent, ["compact", true]);

        expect(readSyncValue(session)).toEqual({ tab: "pages" });
        expect(readSyncValue(persistent)).toEqual(["compact", true]);
    });

    test("expires persistent values on read", () => {
        writeSyncValue(persistent, { stale: true }, document, { expiresAt: Date.now() - 1 });
        expect(readSyncValue(persistent)).toBeUndefined();
    });

    test("rejects structured URL parameter state", () => {
        const target = { scope: "param", key: "ulvia-official-filter" } satisfies CmsSyncTarget;
        expect(() => writeSyncValue(target, { invalid: true })).toThrow("only accepts scalar");
    });
});
