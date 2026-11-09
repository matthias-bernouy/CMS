export interface HostingTlsServices {
    readonly hostingTls: { permit(hostname: string): Promise<void> };
}
