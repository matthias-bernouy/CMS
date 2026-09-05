import { localProviderSimulationEnabled } from "../../env.ts";

export function localSimulationLabelUrl(expeditionNumber: string): string {
    return `https://mondial-relay.ulvia.invalid/labels/${expeditionNumber}.pdf`;
}

export function localSimulationLabelPdf(labelUrl: string, expeditionNumber: string): string | undefined {
    if (
        !localProviderSimulationEnabled() ||
        !/^\d{8}$/.test(expeditionNumber) ||
        labelUrl !== localSimulationLabelUrl(expeditionNumber)
    ) {
        return undefined;
    }
    const content = [
        "BT /F1 20 Tf 40 780 Td (LOCAL SHIPPING SIMULATION) Tj",
        `0 -40 Td /F1 14 Tf (Shipment: ${expeditionNumber}) Tj`,
        "0 -30 Td (Development label - not valid for carrier shipment.) Tj ET",
    ].join("\n");
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    let document = "%PDF-1.4\n";
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
        offsets.push(document.length);
        document += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xrefOffset = document.length;
    document += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) {
        document += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    return `${document}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
}
