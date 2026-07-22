import { describe, expect, test } from "bun:test";
import type { IdentityValue } from "@bernouy/cms-identities";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { withFunctionExecutionScope } from "cms-functions/core/execution/context/functionExecutionScope";

describe("function execution identity scope", () => {
    test("invalidates a distinct resolver after the source identity service binds", async () => {
        let mappedAccount: IdentityValue = "acct-old";
        let resolverCalls = 0;
        const scoped = withFunctionExecutionScope({
            sources: new InMemorySourceRepository(),
            identities: {
                resolve: async () => {
                    resolverCalls += 1;
                    return mappedAccount;
                },
            },
            deps: {
                identities: {
                    resolve: async () => mappedAccount,
                    bind: async (_subjectId, alias) => {
                        mappedAccount = alias.value;
                    },
                },
            },
        });
        const alias = { authority: "commerce", kind: "user" as const, value: 184 };

        expect(await scoped.identities!.resolve(alias, "stripe-connect")).toBe("acct-old");
        expect(await scoped.identities!.resolve(alias, "stripe-connect")).toBe("acct-old");
        expect(resolverCalls).toBe(1);

        await scoped.deps!.identities!.bind("seller-1", {
            authority: "stripe-connect",
            kind: "user",
            value: "acct-new",
        });

        expect(await scoped.identities!.resolve(alias, "stripe-connect")).toBe("acct-new");
        expect(resolverCalls).toBe(2);
    });
});
