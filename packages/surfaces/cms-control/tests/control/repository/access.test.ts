import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication, type Authentication, type Subject } from "@bernouy/cms-auth";
import type { Middleware } from "@bernouy/http-runner";
import { createControlAccessGuard } from "cms-control/core/admin/control/adminAccess";
import {
    createRepositoryManagementAccessGuard,
    type RepositoryManagementAccess,
} from "cms-control/core/admin/control/mountRoutes/repositoryAccess";
import type { CMS_ROLES } from "types/roles";

const ACCESS: RepositoryManagementAccess = {
    administratorSubjectIdentifier: "repository-owner",
};

describe("repository management access", () => {
    test("allows the exact configured administrator on both repository subtrees", async () => {
        const auth = authentication({
            identifier: "repository-owner",
            role: "admin",
            email: "shared@example.test",
        });
        const guards = repositoryGuards(auth, ACCESS);

        expect(await status(guards, "/cms/admin/repository")).toBe(200);
        expect(await status(guards, "/cms/admin/repository/versions/1.0.0")).toBe(200);
        expect(await status(guards, "/cms/api/repository/publications")).toBe(200);
    });

    test("rejects another administrator even when the email is identical", async () => {
        const auth = authentication({
            identifier: "another-admin",
            role: "admin",
            email: "shared@example.test",
        });
        const guards = repositoryGuards(auth, ACCESS);

        expect(await status(guards, "/cms/admin/repository")).toBe(403);
        expect(await status(guards, "/cms/api/repository/publications")).toBe(403);
    });

    test("hides repository management when the capability is not configured", async () => {
        const auth = authentication({ identifier: "repository-owner", role: "admin" });
        const guards = repositoryGuards(auth, undefined);

        expect(await status(guards, "/cms/admin/repository")).toBe(404);
        expect(await status(guards, "/cms/api/repository/status")).toBe(404);
    });

    test("does not treat colliding path prefixes as repository management", async () => {
        const auth = authentication({ identifier: "another-admin", role: "admin" });
        const guards = repositoryGuards(auth, undefined, "/cms/");

        expect(await status(guards, "/cms/admin/repository-preview")).toBe(200);
        expect(await status(guards, "/cms/api/repository-export")).toBe(200);
        expect(await status(guards, "/cms-other/admin/repository")).toBe(200);
    });

    test("leaves missing sessions and non-admin roles to the outer Control auth guard", async () => {
        const missingAuth = authentication(null);
        const missingSessionGuards = repositoryGuards(missingAuth, ACCESS);
        expect(await status(missingSessionGuards, "/cms/admin/repository")).toBe(302);

        const userAuth = authentication({ identifier: "repository-owner", role: "user" });
        const userGuards = repositoryGuards(userAuth, ACCESS);
        expect(await status(userGuards, "/cms/api/repository/status")).toBe(403);
    });
});

function authentication(subject: Subject<CMS_ROLES> | null): Authentication<CMS_ROLES> {
    if (subject) {
        return new InMemoryAuthentication(subject);
    }
    return {
        loginUrl: "/login",
        logoutUrl: "/logout",
        profileUrl: "/profile",
        buildLoginUrl: (returnTo) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        buildLogoutUrl: (returnTo) => `/logout?returnTo=${encodeURIComponent(returnTo)}`,
        getSubject: async () => null,
    };
}

function repositoryGuards(
    auth: Authentication<CMS_ROLES>,
    access: RepositoryManagementAccess | undefined,
    basePath = "/cms",
): Middleware[] {
    return [createControlAccessGuard(basePath, auth), createRepositoryManagementAccessGuard(basePath, auth, access)];
}

async function status(guards: Middleware | Middleware[], path: string): Promise<number> {
    const middleware = Array.isArray(guards) ? guards : [guards];
    const request = new Request(`http://localhost${path}`);
    const dispatch = (index: number): Promise<Response> =>
        middleware[index]?.(request, () => dispatch(index + 1)) ?? Promise.resolve(new Response("ok"));
    return (await dispatch(0)).status;
}
