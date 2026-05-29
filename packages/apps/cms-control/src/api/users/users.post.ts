import type { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";
import { internalUserId } from "@bernouy/auth-core";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

const ROLES: CMS_ROLES[] = ["admin", "user"];
const MIN_PASSWORD = 8;

/** POST /api/users { email, password, displayName?, role? } — create a local
 *  (email/password) user by hand. Writes BOTH the credential (authn secret) and
 *  the membership row (authz role) exactly like the login flow would, so the
 *  user can sign in immediately and appears in the list with the chosen role.
 *  The `sub` is namespaced via `internalUserId("local", …)` to match what
 *  `SubjectResolver` derives on a normal login — same identity either way. */
export default async function createUser(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const email    = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : undefined;
    const role = (typeof body.role === "string" ? body.role : "user") as CMS_ROLES;

    if (!email)    throw new MissingParam("email");
    if (!password) throw new MissingParam("password");
    if (password.length < MIN_PASSWORD) throw new InvalidParam("password", `at least ${MIN_PASSWORD} characters`);
    if (!ROLES.includes(role))          throw new InvalidParam("role", "expected one of: admin, user");

    // The store also rejects duplicates, but checking first lets us return a
    // clear validation error instead of a generic store failure.
    if (await cms.credentials.getByEmail(email)) throw new InvalidParam("email", "already in use");

    const identity = await cms.credentials.create({ email, password, displayName });
    const user = await cms.users.upsert(
        { ...identity, sub: internalUserId("local", identity.sub), provider: "local" },
        role,
    );
    return Response.json(user);
}
