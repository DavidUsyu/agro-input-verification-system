# First milestone demonstration

This guide demonstrates the agreed initial scope. The university rubric determines the formal 30% assessment.

## Start the system

Install Node.js 24.x and Docker Desktop. From the repository root, install dependencies once with `npm.cmd install`, then run:

```powershell
npm.cmd run local
```

Wait for the frontend and backend to report that they are ready. Keep this terminal running. Open http://localhost:3000. The database retains records between restarts. The website is local to this computer until deployment is configured.

Use a second terminal for setup commands. If no administrator exists, run:

```powershell
npm.cmd run admin:create
```

Enter your administrator details and a password at the hidden prompt. Administrators use the same sign-in page as farmers. Public signup always creates a farmer account.

Optionally prepare sample records:

```powershell
npm.cmd run demo:seed
```

The seed command creates DEMO products only and preserves existing records and accounts. It needs an active administrator. It does not create default login credentials. Dates for new demo codes are relative to the day they are created; existing demo dates/statuses are preserved on repeat runs.

## Demonstrate the complete flow

1. Sign in as an administrator at http://localhost:3000/login. Open **Manage products**.
2. Create a seed or fertilizer product, giving its name and manufacturer. Save it.
3. Choose **New code**, enter the number of packages (1–1,000), batch/date details and the intended distribution county, then select **Generate code**. Every package gets a different identifier while sharing the batch details. Copy or download the generated codes. The administrator cannot choose or rename an identifier. Edit one package's metadata and show that changes persist without changing the other packages. Show Inactive/Suspicious controls.
4. Sign out. Open **Verify code**, enter that code as a guest, and allow current location. An accurate device reading in the assigned county allows an active, unexpired code to match. Compare the saved product/batch details. Denied, uncertain or mismatched location produces a generic review-required result; the detailed assessment is visible only to administrators. Demonstrate an unknown code.
5. Create a farmer account with email or phone, then verify the code while signed in. Open **My verification history** and expand **View saved details**.
6. Sign out and sign in as a different farmer. Their history contains only their checks; administrator product management is unavailable to them.
7. Sign in as the administrator. Open **View verification records**. Show the guest and farmer checks and filter by outcome/account type/date.
8. Edit a product name or status, then verify again. Show that the new check reflects the update while the earlier history keeps its original product details and outcome.

## Optional example codes

After `demo:seed`, use these on http://localhost:3000/verify. New demo fixtures are assigned to Nakuru; matching results require a current sufficiently accurate location in the assigned county. Administrators can edit the assignment for an approved demonstration elsewhere. Existing fixtures keep their previous metadata; assign a county if one is missing. These fixed sample identifiers are fixtures only; real package codes use random generation.

| Code | Initial expected result |
| --- | --- |
| `DEMO-SEED-OK` | Record matched |
| `DEMO-FERT-OK` | Record matched |
| `DEMO-SEED-EXPIRED` | Expired |
| `DEMO-FERT-FLAGGED` | Flagged for review |
| `DEMO-FERT-INACTIVE` | Inactive |
| `DEMO-UNKNOWN` | Code not found |
| `HAS SPACE` | Invalid code |

All DEMO products are explicitly labeled sample data. They represent no real regulatory approval. A code match compares stored records; it cannot establish the physical contents of a package.

## Checks before assessment

```powershell
npm.cmd run check
npm.cmd run db:test
npm.cmd run auth:test
npm.cmd run products:test
npm.cmd run verification:test
npm.cmd run auth:pages:test
npm.cmd run smoke
```

Tests use temporary schemas or simulated services. They do not reset application accounts or product records. Stop the local servers with Ctrl+C; PostgreSQL can be stopped separately with `npm.cmd run db:stop`.

For a full browser rehearsal after building, run `npm.cmd run e2e:test`. It uses headless Microsoft Edge on Windows, ports 3210/9224 and a separate test schema. Set `BROWSER_EXECUTABLE` to another Chromium browser executable if needed. The test covers administrator creation of products/codes, verification outcomes, farmer history isolation, administrator history, snapshot preservation and expired-session recovery. Screenshots are saved under the ignored `.artifacts` directory. It does not add test users to the application schema.

The browser rehearsal simulates Nakuru/Nairobi coordinates and denied/inaccurate readings. It verifies generic public results and administrator-only location details. Simulated locations test the software rules; they do not attest a real device's whereabouts. See [the location feature guide](location-verification.md) for setup and limits.

## Implemented scope

| Requirement | Implementation |
| --- | --- |
| Farmer registration/login/logout | Email or phone, hashed passwords, revocable HttpOnly sessions |
| Administrator authentication | Shared sign-in page, protected administrator pages and APIs |
| Product and code management | Create/read/update, search/filter/pagination, inactivation, unique codes |
| Web verification | Status/expiry/date checks, product details, saved outcome and snapshot |
| Guest verification | No signup required; private history remains protected |
| Farmer history | Only the signed-in farmer's records, with filters and saved details |
| Administrator history | All verification records, with account/result/date filters |

Suspicious-product reporting, administrator review and the monitoring dashboard are now available beyond the original milestone; see [the reporting guide](product-reporting.md) and [dashboard guide](dashboard.md). Later milestones include USSD, exports and deployment. Record deletion uses inactivation so references and history survive.
