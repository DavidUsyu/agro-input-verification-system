# USSD verification and reporting

The application has a USSD menu engine, an administrator-only browser simulator, farmer PIN settings, and an Africa's Talking-compatible callback. A provider account or live dialling code has not been connected.

## Try the flow locally

1. Run `npm.cmd run local` and open `http://localhost:3000`.
2. To enable personal menus, sign in as a farmer and open **My account → USSD account access**. Enter a Kenyan phone number, the current website password and a separate six-digit PIN twice. Numbers must be unique across accounts. Saving resets previous USSD sessions. Disable or reset access from this same section.
3. Sign in as an administrator. Open **Dashboard → Open USSD simulator**, or `/admin/ussd`.
4. Enter a Kenyan phone number and start a session. **1 Verify product** works without a farmer account. Enter an existing printed package code and select the current county using the paginated menu.
5. **2 Farmer account** asks for the separate PIN. The number must match the farmer's saved phone. Account menus provide verification, reporting, the two most recent checks and the two most recent reports. They include web and USSD activity owned by that farmer.

The simulator saves actual checks and confirmed reports to the local database; it does not invent product records. Reports accept a package code or **9 No code**, product name, category, concern, a 10–80 character explanation, optional shop/market location, current county, and explicit confirmation. **2 Cancel** at confirmation and **0 Exit** save no report. Submitted reports enter the existing administrator review workflow. No SMS is sent. PIN setup can add/change a phone after website-password confirmation; this version does not independently prove phone ownership by OTP. Configure phone ownership verification before a public launch.

## Location and identifiers

USSD uses the existing package codes, including their printed hyphens. No shorter numeric identifier has been introduced. Long codes are supported within the 80-character input limit but may be cumbersome to type.

The selected county is stored as `self_reported`, never as a device measurement. When it matches the private distribution county and the product/code are active, unexpired and not future-dated, the farmer sees **Code matched**, the product name and expiry date. The saved outcome is `verified` with reason `matched`. A mismatch or missing distribution assignment still returns **Verification requires review**. Expired, flagged, inactive, malformed and unknown codes retain the existing precedence. Assigned counties and internal reasons are never returned in the public response. A match is based on the farmer's declaration and does not independently prove physical location or package authenticity. Earlier saved outcomes, including `location_self_reported` review records, remain unchanged.

Both channels feed the dashboard totals. Its verification county chart continues to use device-resolved counties; self-reported USSD locations fall in the unavailable/legacy group. Report counties remain self-reported and are shown normally. Administrator verification details identify the source explicitly. Reports expose their web/USSD channel.

## Connect Africa's Talking later

1. Create a sandbox USSD channel in the Africa's Talking dashboard. Copy the assigned service code, rather than assuming the local simulator's placeholder is diallable.
2. Generate a random callback token, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it only in ignored `backend/.env` as `USSD_CALLBACK_TOKEN`. Set `USSD_SERVICE_CODE` to the exact assigned code. Leave both empty to disable external callbacks.
3. Expose the backend callback through a public HTTPS URL using a tunnel or deployed service. Keep unrelated backend routes private where possible. Configure the channel's callback as `https://<backend-host>/api/ussd/callback/<token>`. Treat the entire URL as a credential; redact it from proxy/access logs and screenshots. Restart the backend after changing configuration.
4. Use the provider's sandbox simulator to dial its assigned sandbox code. Sandbox channels do not work on actual handsets. A live service is a separate provisioning and billing step; no live code is purchased or enabled by this implementation.

Callback contract: POST `application/x-www-form-urlencoded` with `sessionId`, `serviceCode`, `phoneNumber`, cumulative `text`, optional `networkCode`. Responses are plain text starting with `CON ` or `END `, capped at 160 characters. Incoming provider callbacks do not need website cookies or an Origin header. They require the callback token and exact configured service code. This token is an application access check, not a provider signature or phone-location attestation. Confirm provider authentication/IP controls and log handling before public use. No Africa's Talking API key is needed merely to receive callbacks; outgoing SMS/OTP would be a separate integration.

Official references: [Node callback examples](https://africastalkingltd.gitbooks.io/mobile-communication-apis/content/node_js/programmer_level.html), [sandbox setup](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox), [live callback setup](https://help.africastalking.com/en/articles/9915125-how-do-i-go-live-with-ussd), [Kenyan character limits](https://help.africastalking.com/en/articles/1284096-what-is-the-character-limit-for-ussd-menus-and-user-input-in-kenya).

## Persistence and checks

Migration 006 adds `ussd_credentials` and `ussd_sessions`, a report channel column, and the new source/reason values. Existing products, codes, accounts, report content and verification records are preserved. PINs use the existing salted scrypt implementation. Five unsuccessful PIN attempts lock access for 15 minutes across sessions; a successful website PIN reset clears the lock. Account suspension, PIN reset, disabling access or changing the number invalidates account menus, including cached private responses.

Sessions expire after five minutes. Phone/service binding and HMAC digests enforce cumulative request order without storing raw callback text or PINs. An atomic row lock commits each transition and its response with the resulting verification/report. Concurrent retries of the latest request return that response without duplicate writes. Out-of-order requests terminate; transactions roll back on failures. Expired rows are retained for a day then purged in bounded batches when sessions start. Without a callback token, the local simulator uses a process-random HMAC key; restarting the backend ends unfinished local sessions. Provider callbacks contain the PIN in cumulative text, so provider/proxy logging must be reviewed separately; application database redaction cannot control third-party logs.

Callback and simulator requests are limited to 200 per phone per 15 minutes per process; the local map is bounded to 10,000 entries. Website PIN changes use the existing session, role, origin, JSON-size and attempt controls, plus password reauthentication. Multiple instances need a shared request limiter and scheduled cleanup. Production transport requires HTTPS and appropriate provider gateway controls.

Build the backend, then run `npm.cmd run ussd:test`. The integration suite uses an isolated temporary schema and checks permissions, PIN enrollment/lock/reset, menu budgets, location handling, status precedence, history ownership, binding/expiry, retry deduplication, report cancellation, failure rollback and redaction. The browser rehearsal (`npm.cmd run e2e:test`, after a frontend build) covers farmer PIN setup and the administrator simulator on desktop/mobile.
