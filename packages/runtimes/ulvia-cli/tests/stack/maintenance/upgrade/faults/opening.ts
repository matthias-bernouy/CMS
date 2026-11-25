import { expect } from "bun:test";
import { join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { until, journal } from "../database";
import type { UpgradeFixture } from "../fixture";
import type { HistoricalData } from "../seed";
export async function crashOpening(f: UpgradeFixture, data: HistoricalData) {
    const barrier = join(f.root, "proxy-barrier");
    const cli = await f.start(
        "new",
        ["upgrade", "--version", f.targetVersion, "--backup-directory", `${f.root}/opening-checkpoint`],
        { ULVIA_UPGRADE_PROXY_BARRIER: barrier },
    );
    await until(async () => {
        if (typeof cli.child.exitCode === "number") {
            throw new Error(`Upgrade ended before activation barrier; see ${f.root}`);
        }
        return Bun.file(`${barrier}.ready`).exists();
    });
    expect((await journal(f)).phase).toBe("opening");
    await data.current();
    const attemptId = crypto.randomUUID();
    const added = await data.call("/forms/v2/submit", { ...data.submission, attemptId });
    const file = join(f.paths.cmsFiles, "after-activation");
    await writeFile(file, "new committed payload");
    cli.kill();
    expect(await cli.result).toBe(137);
    expect((await journal(f)).phase).toBe("opening");
    expect(await f.run("new", ["upgrade"])).toBe(0);
    expect(await journal(f)).toBeNull();
    await data.current();
    expect((await data.call("/submissions/v2/get", { receiptId: attemptId }, "QUERY")).receiptId).toBe(added.receiptId);
    expect(await data.call("/forms/v2/submit", { ...data.submission, attemptId })).toEqual(added);
    expect(await readFile(file, "utf8")).toBe("new committed payload");
    const exported = await readFile(
        join(f.root, "opening-checkpoint/migration/forms-v1-email-settings.ndjson"),
        "utf8",
    );
    expect(exported).toContain("archive@example.test");
    expect(exported).not.toContain("Historical retained answer");
}
