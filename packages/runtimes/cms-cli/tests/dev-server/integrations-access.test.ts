import { describe, expect, test } from "bun:test";
import {
    FunctionSourceRepository,
    InMemoryFunctionRepository,
    functionEndpointUrn,
    type CmsFunction,
} from "@bernouy/cms-functions";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import { seedDevSourceAccess } from "cms-cli/dev-server/integrations";

describe("seedDevSourceAccess", () => {
    test("grants authenticated users access to generated CMS functions", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(authFunction("synchronizeSellerPayoutEligibility"));
        const roles = new InMemoryRolesRepository();

        await seedDevSourceAccess(roles, new FunctionSourceRepository(functions));

        const user = await roles.get(USER_ROLE);
        expect(user?.grants).toContainEqual({
            permission: functionEndpointUrn("synchronizeSellerPayoutEligibility"),
        });
    });
});

function authFunction(id: string): CmsFunction {
    return {
        id,
        method: "POST",
        access: { mode: "auth" },
        steps: [],
        return: { status: 200, body: { ok: true } },
    };
}
