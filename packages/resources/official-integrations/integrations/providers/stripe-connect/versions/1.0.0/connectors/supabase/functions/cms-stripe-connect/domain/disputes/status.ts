export function terminalDisputeStatus(status: string): boolean {
    return ["won", "lost", "warning_closed", "prevented"].includes(status);
}
