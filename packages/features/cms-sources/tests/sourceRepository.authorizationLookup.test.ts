import { describe, expect, test } from "bun:test";
import {
    CompositeSourceRepository,
    InMemorySourceRepository,
    ValidatingSourceRepository,
    type SourceEndpoint,
    type SourceRepository,
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

describe("SourceRepository authorization lookup propagation", () => {
    test.each([
        ["validating", (inner: SourceRepository) => new ValidatingSourceRepository(inner)],
        ["composite", (inner: SourceRepository) => new CompositeSourceRepository(inner)],
    ] as const)("%s decorator preserves the side-effect-free lookup", async (_name, decorate) => {
        const inner = new AuthorizationAwareSourceRepository();
        await inner.createSource({
            urn: "urn:shop",
            endpoints: [{
                urn: "urn:shop:getCart",
                method: "GET",
                targetUrl: "https://api.example.com/cart",
            }],
        });
        const repository = decorate(inner);

        const endpoint = await repository.getEndpointForAuthorization?.("urn:shop:getCart");

        expect(endpoint?.urn).toBe("urn:shop:getCart");
        expect(inner.authorizationLookupCount).toBe(1);
        expect(inner.fullLookupCount).toBe(0);
    });
});
