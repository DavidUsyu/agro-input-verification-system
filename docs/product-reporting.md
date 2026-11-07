# Product concern reporting

## Farmer workflow

1. Sign in as a farmer. Choose **Report a concern** on farmer home or My reports, or **Report this product** beside a verification result/history item.
2. Reports started from a check carry its available product details and code. For another product, expand the catalogue picker or enter a name/category manually. These are form suggestions: the API still validates ownership and uses current catalogue details when saving a selected product.
3. Select the reason and describe the concern. Seller details and county are grouped separately and remain optional. A linked verification keeps its original code; use **Report a different product** to start without that link.
4. Submit, keep the reference, and open **My reports**. Progress shows Submitted, Under review and Resolved; administrator responses and resolutions are visible directly on the report card. Expand **View report details** for the original concern, seller details and linked verification.

Unknown products and packages without codes can be reported. A matched verification does not prevent reporting physical packaging concerns. Sign-in gives reports and responses a private owner; guests can still verify without signing in. Reports are observations for investigation, not findings that a real brand is counterfeit. No photos/attachments are collected in this version.

## Administrator workflow

1. Open **Product reports** in the administrator sidebar. Search by product/code/seller and filter by status.
2. Choose a report from the queue. The panel shows the farmer's concern, seller details and any linked verification result alongside the review form. Save **Under review**, optionally adding a response to the farmer and an internal note. Unsaved review changes are flagged before switching reports or following a link.
3. Investigate. Any product/code status change is made explicitly in product management; submitting/reviewing a report changes no verification result.
4. Choose **Resolved**, select a resolution and enter a response to the farmer. Save. Reopen as **Under review** if further investigation is required.

Farmers see only their own reports and public responses. Internal notes stay private. Conflicting administrator saves are rejected; refresh to get the latest version. Every review change is retained in database audit history. Times use East Africa Time. Report county is self-reported, separate from device location used during verification.

## Checks

`npm.cmd run reports:test` tests the API in a temporary schema. `npm.cmd run e2e:test` rehearses registered/unknown product submissions, linking from farmer history, ownership, administrator review/resolution and farmer-visible responses in headless Edge. Test data is isolated from application records and screenshots are saved under ignored `.artifacts`. Existing accounts, products, codes and verification records are preserved by migration 005.
