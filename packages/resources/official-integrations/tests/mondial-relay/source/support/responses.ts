import type { JsonRecord } from "./runtime.ts";

export function connectShipmentResponse(options: {
    connectStatusCode?: string;
    connectStatusLevel?: string;
    connectStatusMessage?: string;
    labelUrl?: string;
}): string {
    const code = options.connectStatusCode ?? "0";
    const level = options.connectStatusLevel ?? "Info";
    const message = options.connectStatusMessage ?? "Success";
    if (level === "Error" || level === "Critical") {
        return `<?xml version="1.0" encoding="utf-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
  <StatusList>
    <Status Code="${xmlEscape(code)}" Level="${xmlEscape(level)}" Message="${xmlEscape(message)}" />
  </StatusList>
</ShipmentCreationResponse>`;
    }
    return `<?xml version="1.0" encoding="utf-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
  <ShipmentsList>
    <Shipment ShipmentNumber="00435394">
      <LabelList>
        <Label>
          <LabelValues Key="ModeSandbox" Value="True" />
          <Output>${xmlEscape(options.labelUrl ?? "https://connect-sandbox.mondialrelay.com/labels/00435394.pdf")}</Output>
        </Label>
      </LabelList>
    </Shipment>
  </ShipmentsList>
  <StatusList>
    <Status Code="${xmlEscape(code)}" Level="${xmlEscape(level)}" Message="${xmlEscape(message)}" />
  </StatusList>
</ShipmentCreationResponse>`;
}

export function trackingResponse(eventLabel = "Livré", statusCode = "82"): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetailleResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_TracingColisDetailleResult>
        <STAT>${xmlEscape(statusCode)}</STAT>
        <Libelle01>Colis livré</Libelle01>
        <Libelle02>au destinataire</Libelle02>
        <Tracing>
          <Libelle>${xmlEscape(eventLabel)}</Libelle>
          <Date>12/07/2026</Date>
          <Heure>11:30</Heure>
          <Emplacement>PARIS</Emplacement>
          <Relais_Num>024474</Relais_Num>
          <Relais_Pays>FR</Relais_Pays>
        </Tracing>
      </WSI2_TracingColisDetailleResult>
    </WSI2_TracingColisDetailleResponse>
  </soap:Body>
</soap:Envelope>`;
}

export function widgetRelayLookupResponse(): string {
    return `cmsRelayPoints({
  "Error": null,
  "PRList": [
    {
      "Adresse1": "38 RUE MAUCONSEIL",
      "Adresse2": "",
      "Available": true,
      "CP": "75001",
      "HoursHtmlTable": "",
      "ID": "034439",
      "Lat": "48,8641433",
      "Long": "2,3470309",
      "Nature": "1",
      "Nom": "ARS INFORMATIQUE",
      "Pays": "FR",
      "Photo": null,
      "Ville": "PARIS",
      "Warning": ""
    },
    {
      "Adresse1": "85 BIS RUE REAUMUR",
      "Adresse2": "",
      "Available": true,
      "CP": "75002",
      "HoursHtmlTable": "",
      "ID": "024474",
      "Lat": "48,866999",
      "Long": "2,347949",
      "Nature": "C",
      "Nom": "LOCKER G20 RUE REAUMUR",
      "Pays": "FR",
      "Photo": null,
      "Ville": "PARIS",
      "Warning": ""
    }
  ]
});`;
}

export function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

export function jsonpResponse(value: string, status = 200): Response {
    return new Response(value, {
        status,
        headers: { "content-type": "application/javascript; charset=utf-8" },
    });
}

export async function jsonBody(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    try {
        return JSON.parse(text) as JsonRecord;
    } catch {
        throw new Error(`expected JSON response, got ${response.status}: ${text}`);
    }
}

export function xmlResponse(value: string, status = 200): Response {
    return new Response(value, {
        status,
        headers: { "content-type": "application/xml; charset=utf-8" },
    });
}

export function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
