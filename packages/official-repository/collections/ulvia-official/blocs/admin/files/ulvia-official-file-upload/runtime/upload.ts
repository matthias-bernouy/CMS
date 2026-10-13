type UploadTicket = Readonly<{ uploadId: string; uploadToken: string }>;

/** Raw file bytes and their upload token cannot be represented by the declarative form transport. */
export async function writeWorkspaceUpload(ticket: UploadTicket, file: File, signal: AbortSignal): Promise<void> {
    const response = await fetch(`/.cms/call/ulvia.cms.files/uploads/${encodeURIComponent(ticket.uploadId)}`, {
        method: "PUT",
        signal,
        headers: {
            "content-type": file.type || "application/octet-stream",
            "upload-token": ticket.uploadToken,
        },
        body: file,
    });
    if (!response.ok) {
        throw new Error(String(response.status));
    }
}
