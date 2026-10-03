import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import { collectionBody } from "cms-control/core/content/installedCollections/body";
import { collectionService } from "cms-control/core/content/installedCollections/service";
import {
    parseCollectionReleaseTargets,
    stageCollectionTargets,
} from "cms-control/core/content/installedCollections/staging";

export default async function planMigration(request: Request, cms: ControlCms): Promise<Response> {
    await requireControlAdministrator(request, cms);
    const body = await collectionBody(request);
    const service = collectionService(cms);
    if (!service.migrations) {
        throw Object.assign(new Error("Collection migrations are not configured"), { status: 503 });
    }
    const revision = revisionFrom(body.revision);
    const targets = await stageCollectionTargets(cms, parseCollectionReleaseTargets(body.targets));
    return Response.json(await service.migrations.plan(service.siteId, targets, revision));
}

function revisionFrom(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw Object.assign(new Error("A nonnegative collection revision is required"), { status: 400 });
    }
    return value as number;
}
