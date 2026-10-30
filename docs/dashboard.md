# Administrator dashboard

Sign in as an administrator and open `/admin` or **Dashboard** in the navigation. Farmers retain their own account pages.

## Using the overview

The default is the last 30 calendar days in East Africa Time. Choose inclusive from/to dates and a county, then **Apply filters**. **Last 7 days**, **Last 30 days**, and **Reset filters** provide quick selections. Ranges are limited to 366 days. **Refresh dashboard** loads current database records; the update timestamp shows when this view was generated. There is no automatic live stream.

Summary cards show products, package codes, verification count, today's checks, review-required checks, and unresolved reports. Products and package codes are always catalogue-wide totals, not remaining stock. Today's card uses today and selected county regardless of the selected date range. Other activity cards use the selected period/county.

The activity chart shows daily checks and reports submitted, including days with zero activity. Expand **View daily counts** for an exact table. Outcome bars show every saved verification outcome. Report summaries show current Submitted/Under review/Resolved counts for reports created in the selected period, and the five most frequently reported products. Reports are concerns, not findings of counterfeit products.

Verification county totals use device-reported locations, separately from report locations entered by farmers. Older profile-based locations and checks with unavailable/unresolved location are labelled **Location unavailable or legacy**. The unavailable county filter selects those checks and reports without a supplied county. The overview never uses a package's intended distribution county as the farmer's actual location.

Recent lists show up to five checks and five reports. Their links open the full management views with the relevant code/product search or report status already selected. Those full views have their own filters; dashboard dates/county are not carried over. The top buttons lead to product management, verification records and report review. Account details and sign-out remain available.

Empty views show zero counts and an explanation. A failed request displays an error and retry action instead of zero totals. Tests and sample dashboard activity use isolated schemas, without adding records to the application catalogue.

## Validation

Run `npm.cmd run dashboard:test` for API/aggregation coverage, and `npm.cmd run e2e:test` after building for the complete browser rehearsal. The rehearsal includes filters, daily tables, responsive layouts, links, authorization and recovery from a simulated outage. Screenshots are saved in ignored `.artifacts`.
