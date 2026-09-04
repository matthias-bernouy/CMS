import { changeOwnPassword, resolveRequestSubject } from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";

export type CurrentProfile = {
    logoutUrl: string;
    email: string;
    role: string;
    roleLabel: string;
    provider: string;
    passwordCard: Record<string, never>[];
};

export async function readCurrentProfile(req: Request, cms: ControlCms, returnTo: string): Promise<CurrentProfile> {
    const subject = await resolveRequestSubject(cms.auth, req);
    if (!subject) {
        throw new MissingParam("session");
    }
    const user = await cms.users.getBySub(subject.identifier);
    const provider = user?.provider ?? "";
    const role = user?.role ?? subject.role;
    return {
        logoutUrl: cms.auth.buildLogoutUrl(returnTo),
        email: user?.email ?? subject.email ?? "",
        role,
        roleLabel: role.charAt(0).toUpperCase() + role.slice(1),
        provider,
        passwordCard: provider === "local" ? [{}] : [],
    };
}

export async function changeCurrentPassword(req: Request, cms: ControlCms): Promise<void> {
    const subject = await resolveRequestSubject(cms.auth, req);
    if (!subject) {
        throw new MissingParam("session");
    }
    const user = await cms.users.getBySub(subject.identifier);
    if (!user) {
        throw new MissingParam("user");
    }
    const body = await readJsonBody(req);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword) {
        throw new MissingParam("currentPassword");
    }
    if (!newPassword) {
        throw new MissingParam("newPassword");
    }
    await changeOwnPassword({ credentials: cms.credentials }, user, currentPassword, newPassword);
}
