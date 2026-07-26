import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { calibrateOfficialIntegrationSchemas } from "./calibration";

const filterIndex = Bun.argv.indexOf("--filter");
const filter = filterIndex >= 0 ? Bun.argv[filterIndex + 1]?.trim() : undefined;
if (filterIndex >= 0 && !filter) {
    throw new Error("--filter requires an exact official integration kind");
}

const report = await calibrateOfficialIntegrationSchemas({
    env: process.env,
    officialRoot: OFFICIAL_INTEGRATIONS_ROOT,
    ...(filter ? { filter } : {}),
});
console.info(JSON.stringify(report, null, 2));
