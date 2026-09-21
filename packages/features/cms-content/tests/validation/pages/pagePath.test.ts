import { describe, expect, test } from "bun:test";
import {
    ContentValidationError,
    derivePagePath,
    DuplicatePagePathError,
    isValidPathFormat,
    ValidatingCmsRepository,
    type CmsRepository,
} from "@bernouy/cms-content";

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

    test("validates and normalizes language paths before delegating", async () => {
        const writes: Record<string, string>[] = [];
        const inner = {
            getSystem: async () => ({ site: { language: "fr", additionalLanguages: ["en"] } }),
            setPagePaths: async (_id: string, paths: Record<string, string>) => {
                writes.push(paths);
                return { id: "page", path: paths.fr, paths };
            },
        } as CmsRepository;
        const repository = new ValidatingCmsRepository(inner);
        await repository.setPagePaths("page", { FR: "/about", en: "/about" });
        expect(writes).toEqual([{ fr: "/about", en: "/about" }]);
        await expect(repository.setPagePaths("page", { fr: "/about", en: "invalid" })).rejects.toBeInstanceOf(
            ContentValidationError,
        );
        await repository.setPagePaths("page", { fr: "/about", en: "/contact" });
        expect(writes.at(-1)).toEqual({ fr: "/about", en: "/contact" });
        expect(writes).toHaveLength(2);
    });
});
