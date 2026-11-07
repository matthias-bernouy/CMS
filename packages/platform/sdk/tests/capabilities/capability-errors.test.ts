import { expect, test } from "bun:test";
import { defineCapability, capabilityError, isCapabilityFailure, z } from "@bernouy/ulvia-sdk";
import { readNote } from "../../examples/notes";
test("capability errors validate their own payload and retain operation identity without HTTP policy", () => {
    const failure = capabilityError(readNote, "NOT_FOUND", { message: "Missing" });
    expect(isCapabilityFailure(failure)).toBe(true);
    expect(isCapabilityFailure(new Error("Unrelated"))).toBe(false);
    expect(failure.capability).toBe(readNote);
    expect(failure.code).toBe("NOT_FOUND");
    expect(failure.output).toEqual({ message: "Missing" });
    expect("status" in failure).toBe(false);
    const noPayload = defineCapability({
        id: "test.capability",
        access: "public",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        bindings: [{ id: "mcp", transport: "mcp" }],
        input: z.strictObject({}),
        output: z.boolean(),
        errors: { DISABLED: { retryable: false } },
    });
    expect(capabilityError(noPayload, "DISABLED").output).toBeUndefined();
    const payload = { message: "Original" };
    const snapshot = capabilityError(readNote, "NOT_FOUND", payload);
    payload.message = "Mutated";
    expect(snapshot.output).toEqual({ message: "Original" });
});

test("capability failures keep standard private causes without changing declared payloads", () => {
    const cause = new Error("private-password");
    const failure = capabilityError(readNote, "NOT_FOUND", { message: "Missing" }, { cause });
    expect(failure.cause).toBe(cause);
    expect(Object.keys(failure)).not.toContain("cause");
    expect(JSON.stringify(failure)).not.toContain("private-password");
});
