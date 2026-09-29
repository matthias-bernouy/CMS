import { expect, test } from "bun:test";
import { SecretValidationError } from "@bernouy/secret-store";
import { withValidationResponse } from "cms-control/core/management/secrets/withValidationResponse";

test("the Control secrets boundary maps key validation errors to HTTP 400", async () => {
    const response = await withValidationResponse(async () => {
        throw new SecretValidationError("secret key is invalid");
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "secret key is invalid" });
});
