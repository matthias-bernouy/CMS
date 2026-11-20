# @bernouy/browser-capture

Generic document captures only. No CMS identities, authorization, persistence or
network fetching. Keep Playwright and process execution behind `./playwright`.
The runtime supplies browser paths and isolation configuration. Never fall back
to unsandboxed execution. Workers receive explicit document bytes, not secrets.
