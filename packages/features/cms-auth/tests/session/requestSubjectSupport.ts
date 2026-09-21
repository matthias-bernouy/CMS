import type { Authentication, Subject } from "@bernouy/cms-auth";

export class TestAuthentication implements Authentication {
    readonly loginUrl = "/login";
    readonly logoutUrl = "/logout";
    readonly profileUrl = "/profile";
    calls = 0;

    constructor(private readonly load: (request: Request) => Promise<Subject | null>) {}

    buildLoginUrl(returnTo: string): string {
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    getSubject(request: Request): Promise<Subject | null> {
        this.calls += 1;
        return this.load(request);
    }
}
