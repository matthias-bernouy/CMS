import type { ControlCms } from 'src/control/ControlCms';

export async function deleteDataProvider(cms: ControlCms, id: string): Promise<boolean> {
    const existing = await cms.repository.getDataProvider(id);
    if (!existing) return false;
    await cms.repository.deleteDataProvider(id);
    return true;
}
