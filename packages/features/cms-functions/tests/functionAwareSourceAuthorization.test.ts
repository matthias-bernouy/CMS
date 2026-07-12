import { describe, expect, mock, test } from "bun:test";
import { InMemoryFunctionRepository, withFunctionsSource } from "@bernouy/cms-functions";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

class AuthorizationAwareSourceRepository extends InMemorySourceRepository {
    fullLookupCount = 0;
    authorizationLookupCount = 0;

    override getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        this.fullLookupCount += 1;
        return super.getEndpoint(urn);
    }

    getEndpointForAuthorization(urn: string): Promise<SourceEndpoint | null> {
        this.authorizationLookupCount += 1;
        return super.getEndpoint(urn);
    }
}

describe("FunctionAwareSourceRepository authorization lookup", () => {
    test("forwards raw endpoint lookup without invoking the full inner lookup", async () => {
        const inner = new AuthorizationAwareSourceRepository();
        await inner.createSource({
            urn: "urn:shop",
            endpoints: [{
                urn: "urn:shop:getCart",
                method: "GET",
                targetUrl: "https://api.example.com/cart",
            }],
        });
        const sources = withFunctionsSource(inner, new InMemoryFunctionRepository());
        const fetchImpl = mock(async () => new Response("unexpected"));
        const authorizeEndpoint = mock(async () => false);

        const response = await handleSourceRequest(
            sources,
            new Request("http://local/.cms/sources/shop/getCart"),
            {
                prefix: "/.cms/sources/",
                deps: { fetchImpl, authorizeEndpoint },
            },
        );

        expect(response.status).toBe(403);
        expect(inner.authorizationLookupCount).toBe(1);
        expect(inner.fullLookupCount).toBe(0);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
