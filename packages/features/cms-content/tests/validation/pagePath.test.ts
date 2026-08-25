import { describe, expect, test } from "bun:test";
import { derivePagePath, DuplicatePagePathError, isValidPathFormat } from "@bernouy/cms-content";

describe("page path contract", () => {
    test.each([
        ["My Beautiful Article", "/my-beautiful-article"],
        ["À propos de l’équipe", "/a-propos-de-l-equipe"],
        ["Cœur & Æther", "/coeur-aether"],
        ["Products 2026", "/products-2026"],
        ["  --Hello--  ", "/hello"],
        ["✨", ""],
    ])("derives %s as %s", (title, expected) => {
        const path = derivePagePath(title);
        expect(path).toBe(expected);
        if (path) {
            expect(isValidPathFormat(path)).toBe(true);
        }
    });

    test("exposes a stable field-level duplicate error", () => {
        const error = new DuplicatePagePathError("/about");
        expect(error).toMatchObject({
            status: 409,
            publicCode: "page_path_taken",
            field: "path",
            path: "/about",
            message: "A page already uses this path.",
        });
    });
});
