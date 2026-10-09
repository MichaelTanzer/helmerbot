# Background analysis email

## User interaction

Company cards now open an **Email analysis** confirmation page. Opening, refreshing,
prefetching or rerendering the page sends nothing. **Run Analysis** explicitly submits
a single request. Wait for **Request accepted** (HTTP 202), then the tab can close.
The full generated response goes in a plaintext email, never in the HTTP response
or on the webpage. Acceptance is not confirmation of completion or inbox delivery.
The UI stays locked after acceptance; return to the page to intentionally retry later.
Network-error retries within the same mounted page reuse the request UUID.

## Release gate — disabled until configured

Do not enable or merge this feature as a working production service solely because
its preview builds. An operator must confirm the actual deployed Node function has
at least a **300-second** execution budget, including post-response `after()` work.
A source `maxDuration = 300` is a request to the platform, not evidence of the account
plan, Fluid Compute settings or actual deployed function limit.

Required server-side environment:

- Existing `OPENROUTER_API_KEY` and `RESEND_API_KEY`.
- `ANALYSIS_FROM_EMAIL`, or fallback `SIGNUP_FROM_EMAIL`: an explicit single mailbox,
  optionally `HelmerBot <reports@your-domain>`. Its domain must be verified in Resend
  for delivery to arbitrary sign-in addresses. No default sender is supplied;
  `resend.dev` sandbox senders are rejected. Syntax checks do not prove domain
  verification or account delivery permission; the operator must confirm these.
- `ANALYSIS_RUNTIME_SECONDS=300`: operator acknowledgement of the confirmed runtime.
- `ANALYSIS_BACKGROUND_ENABLED=true`: explicitly enable only after the above checks.

No secret values belong in the repo. Missing configuration returns 503 before
acceptance or provider execution. This feature does not need `SIGNUP_TO_EMAIL`,
but the unchanged sign-in notification still does.

A release also requires MT's explicit merge/production authorization. No earlier
model-upgrade approval authorizes this feature. A paid model/email delivery smoke
requires separate spending permission. Do not infer arbitrary-recipient delivery
from local mocks or preview status.

## Execution and reliability contract

Next 15.5.27 supports stable `after()` (stable since 15.1). The route registers an
awaited callback with the server before returning 202. The browser connection does
not own that callback. No unawaited generation promise or in-memory worker queue
is used.

- Function duration request: 300 seconds from route entry.
- Preparation/body/dataset waiting: a shared 10-second deadline; 16 KiB body limit.
- Generation: at most 240 seconds, shortened if necessary to reserve mail time.
- Each mail attempt: at most 10 seconds, shortened near the route deadline.
- Five seconds of final runtime margin. Abort signals reach the HTTP provider.
- Dataset waiting times out, but its existing filesystem API cannot be cancelled;
  a late result cannot schedule a job and a late rejection is handled.

There is **no durable retry, queue, completion store or delivery guarantee**. A
platform timeout, instance termination, process restart or email outage can lose
accepted work; failure notices are best effort. Provider abort does not establish
that provider-side work stopped or that no charge was incurred. Resend acceptance
is not inbox delivery. A generation/report-delivery failure triggers a generic
failure notification where time and email availability allow. Safe logs contain
an opaque request-binding key and fixed stage/outcome, not recipient/report/errors.

The old page estimated 4–5 minutes. This implementation stops generation at four
minutes to fit mail and platform reserves. Real Astra latency has not been measured
for this feature. If real analyses regularly exceed that budget, do not claim this
path meets completion needs: obtain approval for a longer supported budget or a
durable execution service. A minimal durable alternative is a persisted job plus
queue-triggered worker using the same generation/mailer, with provider retries and
completion records; that requires an approved service/dependency/configuration
choice. No such infrastructure has been provisioned here.

Official references:

- https://nextjs.org/docs/app/api-reference/functions/after
- https://vercel.com/docs/functions/configuring-functions/duration
- https://resend.com/docs/dashboard/emails/idempotency-keys

## Identity, CSRF and abuse limitations

Recipient is derived only from the existing URI-encoded `hb_user` name|email cookie.
Request-body recipient fields are rejected. Malformed encoding, controls, multiple
pipes, mailbox lists and invalid mailbox syntax fail before acceptance. This is
**not authenticated identity or proof of mailbox ownership**: the existing cookie
is unsigned and intentionally remains so at MT's request. Intentional impersonation
remains possible; parsing and CSRF protection do not fix it. Do not use this route
for confidential report data or treat it as strong access control.

POST requires JSON and an Origin matching the validated Host authority and Next's
request protocol. Next normalizes loopback hostnames internally, so its URL hostname
is not used as the public authority. Reverse proxies must preserve the public Host
and sanitize protocol forwarding; arbitrary X-Forwarded-Host is not trusted.

Requests require a UUID bound to normalized company/options/recipient. A warm
instance stores at most 1,000 opaque bindings for 24 hours and applies a 60-second
recipient cooldown. These are **best-effort instance-local** controls only: cold
starts, multiple instances and changed UUIDs can bypass them. The UI blocks double
clicks; refresh itself does not resubmit. Cross-instance identical requests may
still repeat generation. Resend idempotency keys bind each request and success/
failure message; provider deduplication has a limited window (24 hours) and differing
re-generated contents may conflict. It is not globally exactly-once processing.

No output cache is shared between users. Full reports are plaintext only (HTML-like
model output is not interpreted as HTML). Subjects have controls stripped. Existing
model options remain bounded: at most 8,000 output tokens, finite sampling ranges,
up to four 200-character stops, and a bounded model identifier. Astra remains the
default; no AI-model selector was added.

## Offline verification / browser reproduction

`npm test`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`.
Tests use the existing TypeScript compiler and Node runner without extra packages.
They test real request/validation/mailer code with external boundaries replaced,
including scheduler isolation, real accelerated abort events, duplicate/conflict
cases, preparation deadlines, safe failure logging and UI hook lifecycle behavior.

For a manual browser smoke, use only dummy keys and a local synthetic sign-in cookie
fixture. Do not call the real signup endpoint (it sends email). No production auth
bypass is present. Start the included loopback-only fixture:

```
node tests/email-mock.mjs 4318 /absolute/path/receipts.jsonl
```

Start the built app on loopback, with a clean environment containing PATH/HOME plus:

```
NODE_ENV=production
OPENROUTER_API_KEY=offline-test-only
RESEND_API_KEY=offline-test-only
OPENROUTER_BASE=http://127.0.0.1:4318
ANALYSIS_BACKGROUND_ENABLED=true
ANALYSIS_RUNTIME_SECONDS=300
ANALYSIS_FROM_EMAIL=reports@example.com
ANALYSIS_LOCAL_TEST=true
ANALYSIS_TEST_EMAIL_URL=http://127.0.0.1:4318/emails
```

Run `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4317`.
Set only on the local test origin an HttpOnly `hb_user` cookie containing
`Offline%20Tester%7Coffline-browser%40example.com`. This tests protected UI integration,
not sign-in or verified ownership. Open `/results`, click **Email analysis**, then
**Run Analysis**. The mock holds generation until explicitly released. Observe 202,
close that tab, then `POST http://127.0.0.1:4318/release` with JSON `{}`. The recorded
email must occur after tab closure and contain the entire synthetic report. Repeat
with a fresh local recipient and release `{"fail":true}` for the failure notification.
Test a malformed fixture cookie for visible pre-acceptance rejection.

The email override is rejected on Vercel and without `ANALYSIS_LOCAL_TEST=true`, and
only accepts loopback URLs with no URL credentials. It is an explicit test seam,
not a production alternate provider. Never configure these test variables in Vercel.
Stop only the fixture and app processes you started after testing. Local success
does not validate Vercel lifetime, actual account configuration, paid provider
quality/latency, arbitrary recipients, or inbox delivery.

An automated version is included for Node 22+ and an already-installed Chrome at
`/opt/google/chrome/chrome`: with the above app/mock running, use
`node tests/browser-email-smoke.mjs /absolute/evidence-dir`. The mock receipt file
must be `/absolute/evidence-dir/browser-receipts.jsonl`. It starts and cleans up its
own isolated Chrome (loopback CDP port 4320), captures screenshots and JSON evidence,
tests double clicks/no auto-send on reload, closes tabs before releasing generation,
checks success and failure emails, and verifies a visible malformed-cookie error.
No browser package installation, preload injection, real signup or email is used.
