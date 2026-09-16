import { describe, expect, test } from "bun:test";
import { parsePushFlags } from "../../src/publication/config";

describe("publication client configuration", () => {
    test("allows one hour for large verified packages and rejects longer waits", () => {
        expect(parsePushFlags(["commerce"], { ULVIA_PUSH_TIMEOUT_MS: "3600000" }).timeoutMs).toBe(3_600_000);
        expect(() => parsePushFlags(["commerce"], { ULVIA_PUSH_TIMEOUT_MS: "3600001" })).toThrow(
            /between 1 and 3600000/,
        );
    });
});
