import { describe, expect, test } from "bun:test";
import { inspectMarkup } from "../index";

const path = "packages/surfaces/cms-edge/src/core/admin/auth/templates/example.html";
const inspect = (content: string) => inspectMarkup({ path, content, kind: "html", browser: true });

describe("declarative mutation form contracts", () => {
    test("reserves mutations for native forms", () => {
        expect(inspect('<form cms-mutation="catalog:save as saved"></form>')).toEqual([]);
        expect(inspect('<div cms-mutation="catalog:save as saved"></div>')[0]).toMatchObject({
            severity: "ERROR",
            rule: "mutation-form-owner",
        });
    });

    test("requires one logical target and an explicit alias", () => {
        for (const mutation of ["", "/.cms/call/catalog/save", "catalog:save", "catalog:save as bad-name"]) {
            expect(inspect(`<form cms-mutation="${mutation}"></form>`)[0]).toMatchObject({
                severity: "ERROR",
                rule: "mutation-contract",
            });
        }
    });

    test("checks typed mutation input descriptors", () => {
        const input = (value: unknown) =>
            inspect(`<form cms-mutation="catalog:save as saved" cms-mutation-input='${JSON.stringify(value)}'></form>`);
        expect(
            input({
                id: { from: "state", key: "@param:site-id" },
                draft: { from: "state", key: "@page:site-draft" },
                enabled: { from: "literal", value: false },
            }),
        ).toEqual([]);
        for (const value of [{ id: 12 }, [{ id: 12 }], { id: { from: "state", key: "@param:site/id" } }, {}]) {
            expect(input(value)[0]).toMatchObject({ severity: "ERROR", rule: "mutation-input-contract" });
        }
    });

    test("rejects every legacy source attribute", () => {
        for (const name of ["cms-source", "cms-source-method", "cms-source-body", "cms-source-success-reload"]) {
            expect(inspect(`<form ${name}="value"></form>`)[0]).toMatchObject({
                severity: "ERROR",
                rule: "legacy-source-binding",
            });
        }
    });
});
