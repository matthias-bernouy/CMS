import { expect, test } from "bun:test";
import { resolve } from "node:path";
import * as auth from "@bernouy/cms-auth";
import * as management from "@bernouy/cms-auth/management";
import * as http from "@bernouy/cms-auth/http";

test("auth entrypoints separate composition, management and HTTP without exposing SMTP at root", () => {
    expect(auth.createPublicAuthActions).toBeFunction();
    expect(http.registerPublicAuthRoutes).toBeFunction();
    expect(management.createLocalUser).toBeFunction();
    expect(management.createAuthEmailTestSender).toBeFunction();
    for (const name of [
        "SmtpEmailer",
        "ConfiguredEmailer",
        "MongoUsersRepository",
        "registerPublicAuthRoutes",
        "createLocalUser",
        "deleteUserCompletely",
        "deleteIdentityProvider",
        "updateIdentityProvider",
    ]) {
        expect(auth).not.toHaveProperty(name);
    }
});

test("ordinary auth entrypoints do not resolve SMTP or Mongo even through transitive helpers", async () => {
    const result = await Bun.build({
        entrypoints: ["index.ts", "http.ts", "management.ts"].map((file) =>
            resolve(import.meta.dir, "../../src/exports", file),
        ),
        target: "bun",
        write: false,
        plugins: [
            {
                name: "reject-auth-runtime-adapters",
                setup(build) {
                    build.onResolve({ filter: /^(nodemailer|mongodb)(\/|$)/ }, (args) => {
                        throw new Error("Unexpected runtime adapter: " + args.path);
                    });
                },
            },
        ],
    });
    expect(result.logs).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.outputs).toHaveLength(3);
});

test("browser helpers bundle independently from authentication and transport implementations", async () => {
    const result = await Bun.build({
        entrypoints: [resolve(import.meta.dir, "../../src/exports/browser.ts")],
        target: "browser",
        write: false,
    });
    expect(result.logs).toEqual([]);
    expect(result.success).toBe(true);
    expect(await result.outputs[0]!.text()).not.toMatch(/nodemailer|mongodb|LocalAuthentication|OidcAuthentication/);
});
