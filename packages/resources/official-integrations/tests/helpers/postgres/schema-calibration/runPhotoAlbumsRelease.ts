import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { verifyPhotoAlbumsAdditiveRelease } from "./execution/releases/photoAlbumsRelease";

const report = await verifyPhotoAlbumsAdditiveRelease({
    env: process.env,
    officialRoot: OFFICIAL_INTEGRATIONS_ROOT,
});
console.info(JSON.stringify(report, null, 2));
