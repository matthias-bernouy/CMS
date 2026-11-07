import { expect, test } from "bun:test";
import { gatewayFailure } from "cms-gateway/provider/client/gatewayFailure";
import { inputFailureResponse } from "@bernouy/cms-gateway/protocol";
import { SchemaValueError } from "@bernouy/ulvia-contracts/schema";

test("provider clients retain localized gateway validation output and safe language metadata", async () => {
    const response = inputFailureResponse(
        new Request("https://cms.test/input", { headers: { "accept-language": "fr" } }),
        400,
        new SchemaValueError("private diagnostic", "$.title"),
    );
    const error = await gatewayFailure(response, new AbortController().signal);
    expect(error).toMatchObject({
        code: "invalid_input",
        status: 400,
        output: { message: "Le champ « $.title » ne respecte pas le format ou les limites attendus." },
        responseHeaders: { "content-language": "fr" },
    });
});

test("gateway failure output is bounded and projects away undeclared diagnostic fields", async () => {
    const response = Response.json(
        {
            failure: {
                code: "invalid_input",
                retryable: false,
                output: { message: "Bad input", internal: "private diagnostic" },
            },
        },
        { status: 400, headers: { "set-cookie": "private-cookie", "content-language": "en" } },
    );
    const error = await gatewayFailure(response, new AbortController().signal);
    expect(error?.output).toEqual({ message: "Bad input" });
    expect(error?.responseHeaders).not.toHaveProperty("set-cookie");
    const invalid = Response.json(
        { failure: { code: "invalid_input", retryable: false, output: { message: "x".repeat(2049) } } },
        { status: 400 },
    );
    expect(await gatewayFailure(invalid, new AbortController().signal)).toBeUndefined();
});
