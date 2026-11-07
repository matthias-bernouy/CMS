import { expect, test } from "bun:test";
import { defineOperation, operationError, isOperationFailure, z } from "@bernouy/ulvia-sdk";
import { readNote } from "../../examples/notes";

test("operation errors validate their own payload and retain operation identity without HTTP policy", () => {
    const failure = operationError(readNote, "NOT_FOUND", { message: "Missing" });
    expect(isOperationFailure(failure)).toBe(true);
    expect(isOperationFailure(new Error("Unrelated"))).toBe(false);
    expect(failure.operation).toBe(readNote);
    expect(failure.code).toBe("NOT_FOUND");
    expect(failure.output).toEqual({ message: "Missing" });
    expect("status" in failure).toBe(false);
    const noPayload = defineOperation({
        input: z.strictObject({}),
        output: z.boolean(),
        errors: { DISABLED: { retryable: false } },
    });
    expect(operationError(noPayload, "DISABLED").output).toBeUndefined();
    const payload = { message: "Original" };
    const snapshot = operationError(readNote, "NOT_FOUND", payload);
    payload.message = "Mutated";
    expect(snapshot.output).toEqual({ message: "Original" });
});
