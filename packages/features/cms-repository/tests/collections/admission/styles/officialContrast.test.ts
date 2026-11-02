import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Token = { id: string; defaults: { light: string; dark?: string } };

function luminance(hex: string): number {
    const values = hex
        .slice(1)
        .match(/../gu)!
        .map((channel) => {
            const value = Number.parseInt(channel, 16) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
    return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}

test("official light/dark text, action, error and focus roles retain contrast after palette migration", async () => {
    const root = resolve("packages/official-repository/collections/ulvia-official/theme/colors");
    const categories = await Promise.all(
        ["surfaces-and-text", "actions", "feedback"].map(
            async (id) => JSON.parse(await readFile(resolve(root, `${id}.json`), "utf8")) as { entries: Token[] },
        ),
    );
    const tokens = new Map(
        categories.flatMap((category) => category.entries.map((token) => [token.id, token] as const)),
    );
    const pairs = [
        ["text-primary", "background-base", 4.5],
        ["text-secondary", "background-surface", 4.5],
        ["text-inverse", "background-inverse", 4.5],
        ["on-primary", "primary", 4.5],
        ["on-primary", "primary-hover", 4.5],
        ["on-primary", "primary-active", 4.5],
        ["on-primary-subtle", "primary-subtle", 4.5],
        ["on-danger", "danger", 4.5],
        ["danger", "background-surface", 4.5],
        ["focus-ring", "background-surface", 3],
    ] as const;
    for (const mode of ["light", "dark"] as const) {
        for (const [foreground, background, minimum] of pairs) {
            const first = luminance(tokens.get(foreground)!.defaults[mode]!);
            const second = luminance(tokens.get(background)!.defaults[mode]!);
            const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
            expect(ratio, `${mode}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
        }
    }
});
