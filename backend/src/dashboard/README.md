# Administrator dashboard

`GET /api/dashboard` requires an active administrator session. Guests receive 401, farmers 403. Responses use `Cache-Control: no-store`; the Next.js GET-only proxy forwards the HttpOnly session cookie. No dashboard endpoint writes records.

Query parameters: optional `from`, `to` (`YYYY-MM-DD`, valid dates in years 1000–9999), and `county` (one of the 47 canonical names, or `unavailable`). Duplicate/unsupported filters are rejected. Default end is today's Kenyan date; default start is 29 days before the end. Ranges are inclusive and limited to 366 days. Future ranges are allowed and may be empty.

The overview uses one repeatable-read, read-only PostgreSQL transaction. A verification/report arriving during a request cannot make separate sections describe different snapshots. Failures return 503, never invented zero totals. The payload includes `filters`, `today`, `generatedAt`, `inventory`, `summary`, `outcomes`, `reportCounts`, `daily`, `verificationCounties`, `reportCounties`, `topReported`, `recentVerifications`, and `recentReports`.

Scopes:

- Inventory counts all catalogue products and all package codes, regardless of filters or status. It is not a count of active products or physical stock remaining.
- Verification totals, outcome counts, county breakdowns and recent checks use verification timestamps in the selected dates and verification county. Today counts today's Kenyan calendar day and selected county, independently of the date range.
- Report totals, ranking, locations and recent submissions use report creation timestamps and the self-reported county. Status counts describe the report's current review state, not its state at a historical date. Unresolved means submitted or under review.
- Verification county is accepted only from device-reported records with a canonical county. Missing/unresolved locations and legacy profile counties are grouped together under null, displayed as unavailable/legacy. The `unavailable` filter selects that group; for reports it selects missing self-reported county. Distribution assignments and profile counties are never substitutes for current verification county.
- Daily dates use East Africa Time and include zero-activity days. Day boundaries are midnight inclusive to next midnight exclusive.
- Registered reported products group by catalogue ID, retaining the most recently submitted name. Unlisted products group by case-insensitive entered name and remain separate from catalogue products with the same name. Ranking is limited to five products; recent lists to five records each, sorted by timestamp and ID. Numbers of reports do not establish counterfeiting.

Recent entries omit reporter contacts and internal review notes. Snapshot names survive later product edits. The county signal remains device-reported and is not an attestation of physical location. No precise GPS coordinates are returned or added to storage.

No new dependency or database migration is required. Run `npm.cmd run dashboard:test` after building; it uses an isolated schema and checks authorization, Kenya midnight boundaries, all outcomes, empty ranges, source separation, grouping, failures, bounded ranges and snapshot consistency during concurrent inserts.
