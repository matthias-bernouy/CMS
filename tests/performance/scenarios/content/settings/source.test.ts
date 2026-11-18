import { expect, test } from "bun:test";
import { publicationCollection } from "../../repository/resources/collection";
import { settingsSources } from "./source";

test("settings fixtures compile real theme and bilingual text contributions with deterministic defaults", async () => {
    const fixture = await publicationCollection(
        "performance-settings",
        {
            contractId: "ulvia/cms.content",
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
        },
        settingsSources(),
    );
    expect(fixture.release.theme?.categories[0]?.entries[0]).toMatchObject({
        id: "accent",
        type: "color",
        defaults: { light: "#123456", dark: "#abcdef" },
    });
    expect(fixture.release.texts?.find(({ id }) => id === "greeting")?.values).toEqual({
        en: "Original greeting",
        fr: "Bonjour",
    });
    expect(
        JSON.parse(fixture.sourceJson).files.some((file: { path: string }) => file.path === "theme/colors.json"),
    ).toBe(true);
});
