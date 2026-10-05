import { htmlResponse } from "@bernouy/http-runner";

const PAGE = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Control unavailable</title>
</head>
<body>
    <main>
        <h1>Control is being rebuilt</h1>
        <p>The legacy static administration has been removed. Collection-backed Control pages are not mounted yet.</p>
    </main>
</body>
</html>`;

export function controlUnavailableResponse(): Response {
    return htmlResponse(PAGE, 503);
}
