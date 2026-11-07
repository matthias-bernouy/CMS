import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { ERROR_MESSAGES } from "../../../src/dispatch/errors/catalogue/index";
import { errorMessage } from "../../../src/dispatch/errors/localize";
import { messageLanguage } from "../../../src/dispatch/errors/locale";
import { bootstrap } from "./fixtures";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";

test("all official errors have complete French and English message outputs in their selected release", async () => {
    const index = await Bun.file(resolve(bootstrap, "index.json")).json();
    const codes = new Set<string>();
    for (const path of index.contracts) {
        const { release } = await admitContractReleaseJson(await Bun.file(resolve(bootstrap, path)).text());
        for (const capability of release.capabilities) {
            for (const error of capability.errors) {
                codes.add(error.code);
                expect(Object.hasOwn(ERROR_MESSAGES, error.code)).toBe(true);
                expect(error.output).toBeDefined();
                for (const language of ["fr", "en"] as const) {
                    const message = errorMessage(release.contractId, capability.id, error.code, language);
                    expect(message).not.toMatch(/\{[a-z]+\}/u);
                    expect(message.length).toBeGreaterThan(0);
                    expect(() => validateSchemaValue(error.output!, { message })).not.toThrow();
                }
            }
        }
    }
    for (const code of ["INVALID_INPUT", "REJECTED", "TOKEN_LIMIT"]) {
        expect(codes.has(code)).toBe(true);
    }
});

test("message languages honor weighted regional preferences and exclusions with English fallback", () => {
    const cases = [
        [undefined, "en"],
        ["es,zh", "en"],
        ["fr-CA, en;q=0.8", "fr"],
        ["fr;q=0.2, en-GB;q=0.9", "en"],
        ["en;q=0, *;q=0.7", "fr"],
        ["fr;q=0, en;q=0", "en"],
        ["fr;q=2, en;q=0.5", "en"],
        ["fr;q=0.8,en;q=0.8", "fr"],
        ["FR-ch", "fr"],
    ] as const;
    for (const [preference, expected] of cases) {
        expect(messageLanguage(preference)).toBe(expected);
    }
});

test("unknown reasons, missing parameters and diagnostics use a bounded safe fallback", () => {
    const render = (reason: Parameters<typeof errorMessage>[4]) =>
        errorMessage("ulvia/cms.content", "pages.create", "INVALID_PAGE", "fr", reason);
    expect(render({ code: "unknown-secret", parameters: { diagnostic: "password=secret" } })).toBe(
        "La page contient des informations invalides.",
    );
    expect(render({ code: "page.heading_skip" })).toBe("La page contient des informations invalides.");
    const message = render({ code: "page.bloc_unknown", parameters: { bloc: "a\n".repeat(4096) } });
    expect(message.length).toBeLessThan(400);
    expect(message).not.toContain("\n");
    const unicode = render({ code: "page.bloc_unknown", parameters: { bloc: "a" + "😀".repeat(200) } });
    expect(() => parseStrictJson(JSON.stringify({ message: unicode }), 4096, 8)).not.toThrow();
});
