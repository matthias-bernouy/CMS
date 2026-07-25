import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { flatten, projectRemote } from "cms-cli/push/system/apply";
import { canonicalSystemHash, scanSystem } from "cms-cli/push/system/scan";

const signupLegalDocuments = [
    {
        key: "terms-of-use",
        label: "Terms of use",
        consentText: "I accept the terms of use.",
        pageId: "stable-cms-page-id",
        enabled: true,
    },
];

const auth = { signupLegalDocuments };

function systemFile(value: object): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-auth-system-"));
    writeFileSync(join(root, "system.json"), JSON.stringify(value));
    return root;
}

describe("system auth scan and hash", () => {
    test("reads documents without changing their stable page ids", async () => {
        expect((await scanSystem(systemFile({ auth })))?.payload.auth).toEqual(auth);
    });

    test("does not manage auth when system.json omits it", async () => {
        expect((await scanSystem(systemFile({ site: { name: "Foo" } })))?.payload).not.toHaveProperty("auth");
    });

    test("hash distinguishes omitted, empty, enabled, and changed policies", async () => {
        const withoutAuth = await scanSystem(systemFile({}));
        const emptyAuth = await scanSystem(systemFile({ auth: { signupLegalDocuments: [] } }));
        const enabledAuth = await scanSystem(systemFile({ auth }));
        const changedAuth = {
            signupLegalDocuments: [
                {
                    ...signupLegalDocuments[0],
                    consentText: "I accept the updated terms of use.",
                },
            ],
        };

        expect(withoutAuth?.hash).not.toBe(emptyAuth?.hash);
        expect(emptyAuth?.hash).not.toBe(enabledAuth?.hash);
        expect(enabledAuth?.hash).not.toBe(
            canonicalSystemHash({
                site: {},
                editor: {},
                auth: changedAuth,
            }),
        );
    });
});

describe("signup legal system push projection", () => {
    test("emits the complete document list through the dotted settings contract", () => {
        expect(flatten({ site: {}, editor: {}, auth })).toEqual({
            "auth.signupLegalDocuments": signupLegalDocuments,
        });
    });

    test("emits an explicit empty list so a remote policy can be disabled", () => {
        expect(flatten({ site: {}, editor: {}, auth: { signupLegalDocuments: [] } })).toEqual({
            "auth.signupLegalDocuments": [],
        });
    });

    test("does not emit auth when the local system omits it", () => {
        expect(flatten({ site: {}, editor: {} })).not.toHaveProperty("auth.signupLegalDocuments");
    });

    test("compares managed auth with the remote policy", () => {
        expect(
            projectRemote({ site: {}, editor: {}, auth: { signupLegalDocuments: [] } }, { site: {}, editor: {}, auth }),
        ).toEqual({ site: {}, editor: {}, auth });
    });

    test("normalizes missing legacy remote auth only when managed locally", () => {
        const remote = { site: {}, editor: {} };

        expect(projectRemote({ site: {}, editor: {}, auth }, remote)).toEqual({
            site: {},
            editor: {},
            auth: { signupLegalDocuments: [] },
        });
        expect(projectRemote({ site: {}, editor: {} }, remote)).toEqual({ site: {}, editor: {} });
    });
});
