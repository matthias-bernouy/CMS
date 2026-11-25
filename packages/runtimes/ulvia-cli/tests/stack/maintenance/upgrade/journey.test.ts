import { expect, test } from "bun:test";
import { upgradeFixture } from "./fixture";
import { seedHistorical } from "./seed";
import { historicalVersion } from "./historical";
import { crashMigration } from "./faults/migration";
import { crashProvider } from "./faults/provider";
import { crashOpening } from "./faults/opening";
const journey = process.env.ULVIA_RUN_UPGRADE_CRASH_JOURNEY === "1" ? test : test.skip;
journey(
    "historical Forms binary upgrades survive partial migration, Provider death and postactivation CLI death",
    async () => {
        const f = await upgradeFixture();
        try {
            console.info("[upgrade-crash] install and populate historical Forms 1.1 using its real CLI/API");
            expect(await f.run("old", ["apply", "--version", historicalVersion])).toBe(0);
            const data = await seedHistorical(f);
            await data.legacy();
            console.info(
                "[upgrade-crash] SIGKILL during partially committed Forms migration, restore original binary/data",
            );
            await crashMigration(f, data);
            console.info("[upgrade-crash] SIGKILL new paused Provider, automatic rollback and old API replay");
            await crashProvider(f, data);
            console.info(
                "[upgrade-crash] successful retry, then kill CLI after activation and retain new writes on resume",
            );
            await crashOpening(f, data);
        } finally {
            await f.close();
        }
    },
    900000,
);
