import { expect, test } from "bun:test";
import type { ControlCms } from "cms-control/ControlCms";
import setUserAdministrator from "cms-control/api/_access/users/admin.post";

test("an administrator can grant and revoke another user's access", async () => {
    const changes: { sub: string; enabled: boolean }[] = [];
    const cms = control(changes);

    const granted = await setUserAdministrator(request("local:member", true), cms);
    const revoked = await setUserAdministrator(request("local:member", false), cms);

    expect(granted.status).toBe(200);
    expect(revoked.status).toBe(200);
    expect(changes).toEqual([
        { sub: "local:member", enabled: true },
        { sub: "local:member", enabled: false },
    ]);
});

test("an administrator cannot revoke their own access", async () => {
    const changes: { sub: string; enabled: boolean }[] = [];

    await expect(setUserAdministrator(request("local:admin", false), control(changes))).rejects.toThrow(
        "You cannot remove your own administrator access",
    );
    expect(changes).toEqual([]);
});

function request(sub: string, enabled: boolean): Request {
    return new Request("http://control.test/api/users/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sub, enabled }),
    });
}

function control(changes: { sub: string; enabled: boolean }[]): ControlCms {
    return {
        auth: { getSubject: async () => ({ identifier: "local:admin" }) },
        users: { getBySub: async (sub: string) => (sub.startsWith("local:") ? { sub } : null) },
        config: {
            administrator: async () => true,
            administrators: {
                canRevoke: async () => true,
                list: async () => ["local:admin"],
                set: async (sub: string, enabled: boolean) => changes.push({ sub, enabled }),
            },
        },
    } as unknown as ControlCms;
}
