# Newsletter Email Broadcast Integration

This integration creates one CMS function that sends an Emailer template to the
first active Newsletter subscribers returned by the installed Newsletter source.

Version `1.0.0` is intentionally small: it creates no provider connector, table,
dashboard, or secret. It depends on the installed Newsletter and Emailer sources.

## Function

- `sendNewsletterBroadcast`
- Method: `POST`
- Access: `admin`
- Body: `{ "templateKey": "template.key", "data": {} }`

The function lists active subscribers with `limit=25`, then calls Emailer
`sendTemplateEmail` once per subscriber.

This version is for smoke tests and small batches. It stops on the first failed
send and does not queue, retry, throttle, or persist campaign progress.
