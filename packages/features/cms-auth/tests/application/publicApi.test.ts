import { expect, test } from "bun:test";
import { resolve } from "node:path";
import * as auth from "@bernouy/cms-auth";
import * as management from "@bernouy/cms-auth/management";

test("auth entrypoints separate composition and management without exposing adapters at root", () => {
    expect(auth.createPublicAuthActions).toBeFunction();
    expect(management.createLocalUser).toBeFunction();
    expect(management.createAuthEmailTestSender).toBeFunction();
    for (const name of [
        "SmtpEmailer",
        "ConfiguredEmailer",
        "MongoUsersRepository",
        "createLocalUser",
        "deleteUserCompletely",
    ]) {
        expect(auth).not.toHaveProperty(name);
    }
});

test("ordinary auth entrypoints do not resolve SMTP or Mongo even through transitive helpers", async () => {
    const result = await Bun.build({
        entrypoints: ["index.ts", "management.ts"].map((file) => resolve(import.meta.dir, "../../src/exports", file)),
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
    expect(result.outputs).toHaveLength(2);
});
