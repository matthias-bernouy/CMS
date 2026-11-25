import { createHttpErrorPages } from "@bernouy/http-runner/html";
const en = createHttpErrorPages("Ulvia")[503];
const fr = createHttpErrorPages("Ulvia", "fr")[503];
/** Only code-owned documents enter this template. Authored snapshots are never evaluated. */
export function defaultMaintenancePage() {
    const negotiate = `{{- $lang := "en" -}}{{- $best := 0.0 -}}{{- $header := .Req.Header.Get "Accept-Language" -}}
{{- if le (len $header) 4096 -}}{{- range $index, $token := splitList "," $header -}}{{- if lt $index 32 -}}
{{- $parts := splitList ";" (lower (trim $token)) -}}{{- $tag := index (splitList "-" (trim (index $parts 0))) 0 -}}
{{- if or (eq $tag "en") (eq $tag "fr") -}}{{- $q := 1.0 -}}
{{- if gt (len $parts) 2 -}}{{- $q = 0.0 -}}{{- else if eq (len $parts) 2 -}}
{{- $parameter := trim (index $parts 1) -}}{{- if regexMatch \`^q=(0(\\.[0-9]{0,3})?|1(\\.0{0,3})?)$\` $parameter -}}{{- $q = float64 (trimPrefix "q=" $parameter) -}}{{- else -}}{{- $q = 0.0 -}}{{- end -}}{{- end -}}
{{- if gt $q $best -}}{{- $lang = $tag -}}{{- $best = $q -}}{{- end -}}{{- end -}}{{- end -}}{{- end -}}{{- end -}}
{{- .RespHeader.Set "Content-Language" $lang -}}{{- if eq $lang "fr" -}}`;
    return {
        handle: [
            { handler: "templates", mime_types: ["text/html"], file_root: "/tmp/disabled-template-files" },
            {
                handler: "static_response",
                status_code: 503,
                body: `${negotiate}${fr}{{- else -}}${en}{{- end -}}`,
                headers: { "Content-Type": ["text/html; charset=utf-8"], Vary: ["Accept-Language"] },
            },
        ],
    };
}
