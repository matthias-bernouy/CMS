import { expect, test } from "bun:test";
import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import { requestContext } from "@bernouy/cms-gateway/protocol";
import { gatewayResultResponse } from "cms-gateway/invocation/http/handleHttpCall";
import { fixture } from "../context/fixture";
import { message, details } from "./fixture";

test("HEAD errors preserve their code and language without requiring a JSON body at the Gateway", async () => {
    const f = await fixture(true, { errorOutput: message });
    f.dispatcher.register("ulvia/catalog", "item.list", async () => {
        throw new ProviderCapabilityDispatchError(
            "NOT_FOUND",
            404,
            "Invalid page",
            { "content-language": "es" },
            details,
        );
    });
    f.mount();
    const result = await f.gateway.invoke({
        siteId: "site-a",
        contractId: "ulvia/catalog",
        capabilityId: "item.list",
        input: { fileId: "one" },
        actor: { kind: "anonymous" },
        metadataOnly: true,
        requestContext: requestContext(new Request("https://site.test/page", { method: "HEAD" }), true),
    });
    expect(result).toMatchObject({ kind: "declared-error", errorCode: "NOT_FOUND", status: 404 });
    expect(result).not.toHaveProperty("output");
    const response = gatewayResultResponse(result, "HEAD");
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-language")).toBe("es");
    expect(f.wireHeaders).toHaveLength(1);
});
