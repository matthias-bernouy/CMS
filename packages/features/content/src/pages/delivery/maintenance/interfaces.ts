export type MaintenanceResource = Readonly<{ contentType: string; bytes: Uint8Array }>;
export type MaintenancePage = Readonly<{
    html: string;
    resources: readonly MaintenanceResource[];
}>;
