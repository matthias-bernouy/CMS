import { describe, expect, test } from "bun:test";
import { importIntegration, InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import { relaySources } from "./sources";

describe("Commerce Mondial Relay delivery installation", () => {
    test("imports, validates, and grants both relay functions", async () => {
        const sources = await relaySources();
        const functions = new InMemoryFunctionRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        const roles = new InMemoryRolesRepository();
        for (const id of ["commerce", "mondial-relay", "user-account"]) {
            const sourceId = id === "mondial-relay" ? "delivery" : id === "user-account" ? "accounts" : id;
            await installations.create({
                id,
                label: id,
                definitionVersion: "3.0.0",
                status: "success",
                answersSnapshot: { id: sourceId },
                secretRefs: {},
                secretInputs: [],
                artifacts: [
                    {
                        type: "source",
                        id: `urn:${sourceId}`,
                        action: "created",
                    },
                ],
                runs: [],
            });
        }
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
            "commerce-mondial-relay-delivery",
        );
        if (!definition) {
            throw new Error("delivery integration not found");
        }

        const result = await importIntegration(
            { sources, functions, installations, roles },
            {
                kind: "commerce-mondial-relay-delivery",
                answers: {},
                options: {},
            },
            [definition],
        );

        expect(result.artifacts).toEqual([
            {
                type: "function",
                id: "setRelayPointForOrder",
                action: "created",
            },
            {
                type: "function",
                id: "getRelayPointForOrder",
                action: "created",
            },
        ]);
        for (const id of ["setRelayPointForOrder", "getRelayPointForOrder"]) {
            const fn = await functions.getFunction(id);
            if (!fn) {
                throw new Error(`${id} was not imported`);
            }
            expect(await validateFunction(fn, { sources })).toEqual([]);
            expect({ method: fn.method, access: fn.access }).toEqual({
                method: id === "setRelayPointForOrder" ? "POST" : "GET",
                access: { mode: "auth" },
            });
        }
        expect((await roles.get(USER_ROLE))?.grants.map((grant) => grant.permission)).toEqual(
            expect.arrayContaining([
                "urn:system-functions:setRelayPointForOrder",
                "urn:system-functions:getRelayPointForOrder",
            ]),
        );
    });
});
