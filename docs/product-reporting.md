# Product concern reporting

## Farmer workflow

1. Sign in as a farmer. Open **Reports → Report a product**, or **Report a concern** beside a verification result/history item.
2. Search/select a catalogue product, or choose **Not listed / enter product details** and enter a name/category.
3. Enter an optional code, select the reason, and describe the concern. Seller details and county are optional. A linked verification keeps its original code; use **Start an unlinked report** for a different package.
4. Submit, keep the reference, and follow the review and administrator response in **My reports**.

Unknown products and packages without codes can be reported. A matched verification does not prevent reporting physical packaging concerns. Sign-in gives reports and responses a private owner; guests can still verify without signing in. Reports are observations for investigation, not findings that a real brand is counterfeit. No photos/attachments are collected in this version.

## Administrator workflow

1. Open **Reports** or **Review product reports**. Search by product/code/seller and filter by status.
2. Expand **View report details**. Save **Under review**, optionally adding a response to the farmer and an internal note.
3. Investigate. Any product/code status change is made explicitly in product management; submitting/reviewing a report changes no verification result.
4. Choose **Resolved**, select a resolution and enter a response to the farmer. Save. Reopen as **Under review** if further investigation is required.

Farmers see only their own reports and public responses. Internal notes stay private. Conflicting administrator saves are rejected; refresh to get the latest version. Every review change is retained in database audit history. Times use East Africa Time. Report county is self-reported, separate from device location used during verification.

## Checks

`npm.cmd run reports:test` tests the API in a temporary schema. `npm.cmd run e2e:test` rehearses registered/unknown product submissions, linking from farmer history, ownership, administrator review/resolution and farmer-visible responses in headless Edge. Test data is isolated from application records and screenshots are saved under ignored `.artifacts`. Existing accounts, products, codes and verification records are preserved by migration 005.
