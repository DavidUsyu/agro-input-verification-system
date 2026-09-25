# Agro-Input Verification System

A proposed web-based system that helps smallholder farmers in Kenya check seed and fertilizer product codes against stored product records.

## Project status

Repository setup. Application implementation has not started.

## First implementation milestone

The proposed initial 30% milestone covers:

- Farmer registration, login and logout.
- Administrator login and role-based access.
- Administrator management of products and their verification codes.
- Product-code verification through a web interface.
- Personal verification history for registered farmers and an administrator view of all verification records.
- Guest verification, consistent with the optional farmer relationship in the database design.

The university assessment rubric will determine whether this scope meets the 30% requirement.

## Verification behavior

The system will validate submitted codes, look up stored records, check product status and expiry, save verification results, and display relevant product details.

Initial outcomes will include verified against stored records, expired, unregistered, and explicitly flagged suspicious records. Missing or malformed codes will receive validation messages.

A matching code does not establish the authenticity of physical contents. An unknown code means it was not found in the database; it does not establish that a product is counterfeit. Demonstration data will be clearly identified.

## Later milestones

- Suspicious-product reporting and administrator review.
- Full monitoring dashboard, geographic trends and exports.
- USSD access using the same backend and database.
- Further usability testing and refinement.

## Design basis

The scope is based on the project proposal, *A Web-Based System for Detecting Counterfeit Agro-Inputs Through Product Code Verification Among Smallholder Farmers in Kenya*, and the accompanying agro-input verification design diagrams.

The proposed architecture consists of a web frontend, backend/API and relational database, with a USSD interface added in a later milestone. Framework selection and application setup are pending.

## Running the project

There is no runnable application yet. Setup instructions will be added with the first implementation.
