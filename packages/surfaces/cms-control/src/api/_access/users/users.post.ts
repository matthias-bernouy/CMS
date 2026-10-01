import type { ControlCms } from "cms-control/ControlCms";
import { createLocalUser } from "@bernouy/cms-auth/management";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";

/** POST /api/users { email, password } — create a local
 *  (email/password) user by hand. Writes BOTH the credential (authn secret) and
 *  membership row exactly like the login flow would, so the user can sign in
 *  immediately and appears in the member list.
 *  The `sub` is namespaced via `internalUserId("local", …)` to match what
 *  `SubjectResolver` derives on a normal login — same identity either way. */
export default async function createUser(req: Request, cms: ControlCms) {
    await requireControlAdministrator(req, cms);
    const body = await readJsonBody(req);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email) {
        throw new MissingParam("email");
    }
    if (!password) {
        throw new MissingParam("password");
    }
    // The store also rejects duplicates, but checking first lets us return a
    // clear validation error instead of a generic store failure.
    if (await cms.credentials.getByEmail(email)) {
        throw new InvalidParam("email", "already in use");
    }

    const user = await createLocalUser({ credentials: cms.credentials, users: cms.users }, { email, password });
    return Response.json(user);
}
