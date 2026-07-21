import { describe, expect, test } from "bun:test";
import { buildAuditCommand, validateAuditExceptions } from "../../audit/audit";

const TODAY = new Date("2026-07-21T12:00:00.000Z");
const validException = {
    advisory: "GHSA-2345-6789-cfgh",
    rationale: "The vulnerable path is unreachable in this deployment.",
    owner: "security@example.com",
    createdAt: "2026-07-01",
    expiresAt: "2026-07-31",
};

describe("audit exceptions", () => {
    test("accepts a complete active exception lasting at most 30 days", () => {
        expect(validateAuditExceptions({ schemaVersion: 1, exceptions: [validException] }, TODAY)).toEqual([
            validException,
        ]);
    });

    test("rejects expired and overlong exceptions", () => {
        expect(() =>
            validateAuditExceptions(
                {
                    schemaVersion: 1,
                    exceptions: [{ ...validException, expiresAt: "2026-07-20" }],
                },
                TODAY,
            ),
        ).toThrow("expired");
        expect(() =>
            validateAuditExceptions(
                {
                    schemaVersion: 1,
                    exceptions: [{ ...validException, createdAt: "2026-06-30" }],
                },
                TODAY,
            ),
        ).toThrow("at most 30 days");
    });

    test("requires every review field and rejects duplicates", () => {
        const { owner: _owner, ...withoutOwner } = validException;
        expect(() => validateAuditExceptions({ schemaVersion: 1, exceptions: [withoutOwner] }, TODAY)).toThrow(
            "must contain only",
        );
        expect(() =>
            validateAuditExceptions({ schemaVersion: 1, exceptions: [validException, validException] }, TODAY),
        ).toThrow("Duplicate");
    });

    test("passes every approved advisory to Bun audit", () => {
        expect(buildAuditCommand([validException])).toEqual([
            process.execPath,
            "audit",
            "--audit-level=high",
            "--ignore=GHSA-2345-6789-cfgh",
        ]);
    });
});
