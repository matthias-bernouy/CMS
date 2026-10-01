export type Mount = { collectionId: string; viewId: string; label: string };
export type Dashboard = {
    id: string;
    siteId: string;
    name: string;
    icon?: string;
    enabled: boolean;
    revision: number;
    mounts: Mount[];
    navigation?: NavigationItem[];
    members: string[];
    origin?: { kind: "collection"; publisherId: string; collectionId: string; dashboardId: string };
    collectionName?: string;
    description?: string;
    sourceContracts?: string[];
};
export type NavigationItem = {
    id: string;
    label: string;
    icon?: string;
    use?: string;
    childPlacement?: "lateral" | "tabs";
    children?: NavigationItem[];
};
export type ExploreDashboard = {
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    collectionName: string;
    version: string;
    digest: string;
    dashboardId: string;
    name: string;
    description: string;
    viewCount: number;
    installed: boolean;
    installedVersion: string | null;
};
export type AvailableView = {
    collectionId: string;
    collectionName: string;
    viewId: string;
    name: string;
    description: string;
};
export type User = { sub: string; label: string; email: string };
