import type { Authentication, Subject } from "@bernouy/cms-auth";

export class GatewayPatAuthentication implements Authentication<"admin" | "user"> {
    readonly loginUrl = "/login";
    readonly logoutUrl = "/logout";
    readonly profileUrl = "/profile";

    buildLoginUrl(returnTo: string): string {
        return `/login?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `/logout?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(request: Request): Promise<Subject<"admin" | "user"> | null> {
        const token = request.headers.get("authorization")?.replace(/^Bearer /u, "");
        if (token === "admin-pat") {
            return { identifier: "cms-admin-1", role: "admin" };
        }
        if (token === "other-admin-pat") {
            return { identifier: "cms-admin-2", role: "admin" };
        }
        if (token === "invalid-actor-pat") {
            return { identifier: "cms-\ud800-admin", role: "admin" };
        }
        return token === "user-pat" ? { identifier: "cms-user-1", role: "user" } : null;
    }
}
