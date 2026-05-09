import type { ControlCms } from 'src/control/ControlCms';
import { unpublishProxy } from './publishProxy';

export async function deleteDataProvider(cms: ControlCms, id: string): Promise<boolean> {
    const existing = await cms.repository.getDataProvider(id);
    if (!existing) return false;
    await cms.repository.deleteDataProvider(id);
    cms.specCache.delete(id);
    await unpublishProxy(cms, id);
    return true;
}
