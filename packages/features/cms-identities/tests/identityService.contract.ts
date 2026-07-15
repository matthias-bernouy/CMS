import { describe, expect, test } from "bun:test";
import {
    IdentityAliasConflictError,
    InvalidIdentityError,
    type IdentityAlias,
    type IdentityService,
} from "@bernouy/cms-identities";

type IdentityServiceFactory = () => IdentityService | Promise<IdentityService>;

export function identityServiceContract(name: string, createService: IdentityServiceFactory): void {
    describe(`${name} identity service contract`, () => {
        test("resolves opaque aliases through their CmsCore subject", async () => {
            const identities = await createService();
            await identities.bind("subject-1", { authority: "commerce", kind: "user", value: 184 });
            await identities.bind("subject-1", {
                authority: "stripe-connect",
                kind: "user",
                value: " acct_opaque ",
            });

            expect(await identities.resolve(userAlias("commerce", 184), "stripe-connect")).toBe(" acct_opaque ");
            expect(await identities.resolve(userAlias("commerce", 184), "cms")).toBe("subject-1");
            expect(await identities.resolve(userAlias("cms", "subject-1"), "stripe-connect"))
                .toBe(" acct_opaque ");
        });

        test("treats repeated identical bindings as idempotent", async () => {
            const identities = await createService();
            const alias = userAlias("commerce", 184);

            await identities.bind("subject-1", alias);
            await identities.bind(" subject-1 ", alias);

            expect(await identities.resolve(alias, "cms")).toBe("subject-1");
        });

        test("rejects both alias and subject-authority reassignment", async () => {
            const identities = await createService();
            await identities.bind("subject-1", userAlias("commerce", "private-alias-one"));

            await expect(identities.bind("subject-2", userAlias("commerce", "private-alias-one")))
                .rejects.toBeInstanceOf(IdentityAliasConflictError);
            await expect(identities.bind("subject-1", userAlias("commerce", "private-alias-two")))
                .rejects.toBeInstanceOf(IdentityAliasConflictError);
        });

        test("does not disclose aliases through conflict errors", async () => {
            const identities = await createService();
            const secretAlias = "customer-secret-reference";
            await identities.bind("subject-1", userAlias("private-provider", secretAlias));

            const error = await identities.bind("subject-2", userAlias("private-provider", secretAlias))
                .then(() => null, caught => caught);

            expect(error).toBeInstanceOf(IdentityAliasConflictError);
            expect(error.message).toBe("Identity alias conflicts with an existing binding");
            expect(JSON.stringify(error)).not.toContain(secretAlias);
            expect(JSON.stringify(error)).not.toContain("private-provider");
            expect(Object.keys(error)).toEqual([]);
        });

        test("keeps identical raw values isolated by authority", async () => {
            const identities = await createService();
            await identities.bind("subject-1", userAlias("commerce", 184));
            await identities.bind("subject-2", userAlias("commerce-staging", 184));

            expect(await identities.resolve(userAlias("commerce", 184), "cms")).toBe("subject-1");
            expect(await identities.resolve(userAlias("commerce-staging", 184), "cms")).toBe("subject-2");
            expect(await identities.resolve(userAlias("commerce", 184), "commerce-staging")).toBeNull();
        });

        test("normalizes authority identifiers without changing opaque values", async () => {
            const identities = await createService();
            await identities.bind("subject-1", userAlias(" commerce ", " external-id "));

            expect(await identities.resolve(userAlias("commerce", " external-id "), " commerce "))
                .toBe(" external-id ");
            expect(await identities.resolve(userAlias("commerce", "external-id"), "cms")).toBeNull();
        });

        test("rejects malformed aliases without changing state", async () => {
            const identities = await createService();
            const invalidAliases = [
                userAlias("", "alias"),
                userAlias("   ", "alias"),
                userAlias("commerce", ""),
                userAlias("commerce", "   "),
                userAlias("commerce", Number.NaN),
                userAlias("commerce", Number.POSITIVE_INFINITY),
                userAlias("commerce", Number.NEGATIVE_INFINITY),
                { authority: "commerce", kind: "account", value: "alias" },
                { authority: "commerce", kind: "user", value: true },
                { authority: 42, kind: "user", value: "alias" },
                null,
                undefined,
            ] as unknown as IdentityAlias[];

            for (const alias of invalidAliases) {
                await expect(identities.bind("subject-1", alias)).rejects.toBeInstanceOf(InvalidIdentityError);
            }
            expect(await identities.resolve(userAlias("commerce", "alias"), "cms")).toBeNull();
        });

        test("rejects invalid subjects and target authorities", async () => {
            const identities = await createService();
            const alias = userAlias("commerce", 184);

            await expect(identities.bind("", alias)).rejects.toBeInstanceOf(InvalidIdentityError);
            await expect(identities.bind("   ", alias)).rejects.toBeInstanceOf(InvalidIdentityError);
            await expect(identities.bind(null as unknown as string, alias)).rejects.toBeInstanceOf(InvalidIdentityError);
            await expect(identities.resolve(alias, "")).rejects.toBeInstanceOf(InvalidIdentityError);
            await expect(identities.resolve(alias, "   ")).rejects.toBeInstanceOf(InvalidIdentityError);
            await expect(identities.resolve(alias, 42 as unknown as string)).rejects.toBeInstanceOf(InvalidIdentityError);
        });

        test("rejects bindings for the reserved CMS authority without changing existing mappings", async () => {
            const identities = await createService();
            const commerceAlias = userAlias("commerce", 184);
            await identities.bind("subject-1", commerceAlias);

            await expect(identities.bind("subject-1", userAlias("cms", "subject-2")))
                .rejects.toBeInstanceOf(InvalidIdentityError);

            expect(await identities.resolve(commerceAlias, "cms")).toBe("subject-1");
            expect(await identities.resolve(userAlias("cms", "subject-1"), "commerce")).toBe(184);
        });

        test("canonicalizes CMS subjects before lookup and direct return", async () => {
            const identities = await createService();
            await identities.bind(" subject-1 ", userAlias("commerce", 184));

            expect(await identities.resolve(userAlias(" cms ", " subject-1 "), " commerce ")).toBe(184);
            expect(await identities.resolve(userAlias(" cms ", " subject-1 "), " cms ")).toBe("subject-1");
        });

        test("rejects numeric CMS subjects", async () => {
            const identities = await createService();
            const numericCmsAlias = userAlias("cms", 184);

            await expect(identities.resolve(numericCmsAlias, "commerce"))
                .rejects.toBeInstanceOf(InvalidIdentityError);
            await expect(identities.resolve(numericCmsAlias, "cms"))
                .rejects.toBeInstanceOf(InvalidIdentityError);
        });

        test("uses one canonical key for positive and negative zero", async () => {
            const identities = await createService();
            await identities.bind("subject-1", userAlias("commerce", -0));
            await identities.bind("subject-1", userAlias("commerce", 0));

            expect(await identities.resolve(userAlias("commerce", 0), "cms")).toBe("subject-1");
        });
    });
}

function userAlias(authority: string, value: string | number): IdentityAlias {
    return { authority, kind: "user", value };
}
