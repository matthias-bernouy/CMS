import { describe, expect, test } from "bun:test";
import type { ControlCms } from "cms-control/ControlCms";
import setUserAdministrator from "cms-control/api/_access/users/admin.post";
import resendVerification from "cms-control/api/_access/users/email-verification.post";
import markVerified from "cms-control/api/_access/users/email-verified.post";
import sendReset from "cms-control/api/_access/users/password-reset.post";
import deleteUser from "cms-control/api/_access/users/users.delete";
import listUsers from "cms-control/api/_access/users/users.get";
import createUser from "cms-control/api/_access/users/users.post";
import installCollection from "cms-control/api/_content/collections/install.post";
import saveCollectionConfiguration from "cms-control/api/_content/collections/configuration.put";
import saveCollectionTexts from "cms-control/api/_content/collections/texts.put";
import importCustomProvider from "cms-control/api/_integrations/provider-custom-import.post";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";

type Handler = (request: Request, cms: ControlCms) => Promise<Response>;

const protectedHandlers: readonly [string, Handler, string][] = [
    ["list users", listUsers, "GET"],
    ["create users", createUser, "POST"],
    ["delete users", deleteUser, "DELETE"],
    ["change administrator access", setUserAdministrator, "POST"],
    ["resend email verification", resendVerification, "POST"],
    ["mark email verified", markVerified, "POST"],
    ["send password reset", sendReset, "POST"],
    ["install collections", installCollection, "POST"],
    ["save collection configuration", saveCollectionConfiguration, "PUT"],
    ["save collection texts", saveCollectionTexts, "PUT"],
    ["import custom providers", importCustomProvider, "POST"],
];

describe("Control administrator authorization", () => {
    test("distinguishes authentication from administrator access", async () => {
        await expect(requireControlAdministrator(request(), cms(null, false))).rejects.toMatchObject({ status: 401 });
        await expect(requireControlAdministrator(request(), cms("member", false))).rejects.toMatchObject({
            status: 403,
        });
        expect((await requireControlAdministrator(request(), cms("admin", true))).identifier).toBe("admin");
    });

    for (const [label, handler, method] of protectedHandlers) {
        test(`rejects a member before attempting to ${label}`, async () => {
            await expect(handler(request(method), cms("member", false))).rejects.toMatchObject({ status: 403 });
        });
    }
});

function request(method = "GET"): Request {
    return new Request("http://control.test/cms/api/protected", { method });
}

function cms(identifier: string | null, administrator: boolean): ControlCms {
    return {
        auth: { getSubject: async () => (identifier ? { identifier } : null) },
        config: { administrator: async () => administrator },
    } as unknown as ControlCms;
}
