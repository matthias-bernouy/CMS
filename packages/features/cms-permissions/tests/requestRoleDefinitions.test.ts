import { describe, expect, test } from "bun:test";
import { InMemoryRolesRepository, type RoleDefinition } from "@bernouy/cms-permissions";
import { resolveRequestRoleDefinitions } from "@bernouy/cms-permissions/requestScope";

describe("resolveRequestRoleDefinitions", () => {
    test("single-flights one defensive snapshot and refreshes on the next Request", async () => {
        const roles = new CountingRolesRepository();
        const request = new Request("https://cms.test/source");
        const reads = await Promise.all(Array.from({ length: 5 }, () => resolveRequestRoleDefinitions(roles, request)));
        const originalLabel = reads[0]![0]!.label;
        reads[0]![0]!.label = "mutated";
        expect((await resolveRequestRoleDefinitions(roles, request))[0]!.label).toBe(originalLabel);
        expect(roles.listCalls).toBe(1);

        await roles.upsert({ id: "support", label: "Support", grants: [] });
        expect((await resolveRequestRoleDefinitions(roles, request)).some((role) => role.id === "support")).toBe(false);
        const fresh = await resolveRequestRoleDefinitions(roles, new Request("https://cms.test/source"));
        expect(fresh.some((role) => role.id === "support")).toBe(true);
        expect(roles.listCalls).toBe(2);
    });

    test("evicts a rejected request-local load", async () => {
        const roles = new CountingRolesRepository();
        roles.rejectOnce = true;
        const request = new Request("https://cms.test/source");

        await expect(resolveRequestRoleDefinitions(roles, request)).rejects.toThrow("transient");
        expect(await resolveRequestRoleDefinitions(roles, request)).not.toHaveLength(0);
        expect(roles.listCalls).toBe(2);
    });
});

class CountingRolesRepository extends InMemoryRolesRepository {
    listCalls = 0;
    rejectOnce = false;

    override async list(): Promise<RoleDefinition[]> {
        this.listCalls++;
        if (this.rejectOnce) {
            this.rejectOnce = false;
            throw new Error("transient");
        }
        return super.list();
    }
}
