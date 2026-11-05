import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { DefaultProviderCapabilityDispatcher, ProviderCapabilityDispatchError } from "@bernouy/ulvia-provider";
import { resolveFixtureContract } from "../../ulviaProviderFixture";
import { officialContract, invokeHttp } from "./fixtures";

async function detailedContract(contractId = "ulvia/cms.content") {
    const { release } = await officialContract("ulvia/cms.content");
    const draft = { ...structuredClone(release), contractId };
    const failure = draft.capabilities
        .find(({ id }) => id === "pages.create")!
        .errors.find(({ code }) => code === "INVALID_PAGE")!;
    Object.assign(failure, {
        output: {
            type: "object",
            properties: {
                message: { type: "string", maxLength: 2048 },
                field: { type: "string", maxLength: 100 },
            },
            required: ["message", "field"],
        },
    });
    return { contract: resolveFixtureContract(await admitContractRelease(draft)), schema: failure.output! };
}

test("explicit error outputs and their chosen language survive official localization and release projection", async () => {
    const { contract, schema } = await detailedContract();
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    dispatcher.register("ulvia/cms.content", "pages.create", async () => {
        throw new ProviderCapabilityDispatchError(
            "INVALID_PAGE",
            422,
            "Private diagnostic",
            { "content-language": "es" },
            {
                message: "La página debe contener una sección.",
                field: "layout",
                internal: "private diagnostic",
            },
        );
    });
    const response = await invokeHttp(contract, dispatcher, "pages.create", { path: "/draft", title: "Title" });
    expect(response.status).toBe(422);
    expect(response.headers.get("content-language")).toBe("es");
    const { error } = await response.json();
    expect(error.output).toEqual({ message: "La página debe contener una sección.", field: "layout" });
    expect(() => validateSchemaValue(schema, error.output)).not.toThrow();
});

test.each(["ulvia/cms.content", "ulvia/cms.custom"])(
    "%s native errors keep validated fields without an explicit language header",
    async (contractId) => {
        const { contract, schema } = await detailedContract(contractId);
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        dispatcher.register(contractId, "pages.create", async () =>
            Response.json(
                { error: { code: "INVALID_PAGE", output: { message: "Invalid layout", field: "layout" } } },
                { status: 422 },
            ),
        );
        const response = await invokeHttp(contract, dispatcher, "pages.create", { path: "/draft", title: "Title" });
        expect(response.status).toBe(422);
        const { error } = await response.json();
        expect(error.output).toEqual({ message: "Invalid layout", field: "layout" });
        expect(() => validateSchemaValue(schema, error.output)).not.toThrow();
    },
);

test("an incomplete explicit error output stays invalid instead of being replaced with invented details", async () => {
    const { contract } = await detailedContract();
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    dispatcher.register("ulvia/cms.content", "pages.create", async () => {
        throw new ProviderCapabilityDispatchError(
            "INVALID_PAGE",
            422,
            "private diagnostic",
            {},
            { message: "Invalid layout" },
        );
    });
    const response = await invokeHttp(contract, dispatcher, "pages.create", { path: "/draft", title: "Title" });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body).error.code).toBe("CORE_UNAVAILABLE");
    expect(body).not.toContain("private diagnostic");
});
