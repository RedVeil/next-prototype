# How this platform is supposed to work

This is the design record for the invoice platform. It is written so a person can read it without opening the code. When a decision, a stub, or an open question changes, update this file in the same change.

The web app signs in through Supabase Auth and writes companies, investors, and buckets to the database. The ledger bot generates multisig keys and submits provisioning on XRPL mainnet. It watches RLUSD deposits, and the investor signs withdrawals in Xaman. Seeds stay on the ledger bot. A separate scanner stores new eligible invoices. A separate matcher writes open offers. NFT and payout work stays unwired.

## Decisions

### Parties and onboarding

There are two parties and an admin. A company sells invoices. An investor funds them. Both can open a dashboard as soon as they submit an application. The application stays pending until an admin accepts it. An admin can also create a company or an investor directly, and that record starts accepted.

Know Your Business is shown for both parties and skipped. Open Finance and NF-e are shown for the company and skipped. No KYB provider is called.

A company application collects the legal name, a tax or registration number, the country of origin, industries, a business description, and the goods or services sold. The country is Brazil and the form does not offer another country. Industries come from the shared list and do not include a catch-all "any" choice. Goods and services come from one shared catalog: raw materials, finished goods, wholesale distribution, equipment, professional services, logistics services, maintenance and repair, construction services, agricultural products, food products, software and IT services, and other.

An investor application collects the legal name. KYB is shown and skipped.

While a company is pending, its dashboard does not scan or list invoices. It says the company is still in onboarding. After acceptance, the company dashboard and the invoice list read stored rows. A scanner process, separate from the ledger bot, polls every accepted and allowed company every 5 minutes. Pending and stopped companies are skipped. Tauri Agricola, profile `05525fac-1394-4a73-a502-6102d050045c`, is the only company with a source. The scanner inserts an invoice when it has received no payment, is due today or later, and is not already stored. The buyer name is stored as both the buyer name and the buyer tax id. The product is `agricultural products`. Eligibility is stored separately. A company with no saved filter keeps those invoices ineligible, so the matcher skips them and the company list still shows them. Invoices with any payment, and unsold invoices past their due date, stay stored and are left off the company list and off the matcher. Sold invoices stay on the company list. While an investor is pending, deposits and mandate buckets stay unavailable. Acceptance, or adding the investor directly, enqueues a job named `provision_investor_multisigs`. The ledger bot generates that investor's bot keys, funds the new accounts, and submits the signer list, deposit authorization, and RLUSD trust line. Deposits stay unavailable until that job has succeeded and multisig 1 exists. Buckets can be saved once the investor is accepted.

Admin can allow or stop new company applications and new investor applications separately. A stopped application form does not accept submissions. Admin can also allow or stop a company or an investor who already exists. A stopped party keeps its profile and can be viewed. A stopped company cannot submit invoices or continue an application. A stopped investor cannot deposit, create buckets, or submit again.

### Company profile and the invoice filter

The company stores the fields from the application, plus an application status of pending or accepted, an access status of allowed or stopped, and whether the record came from an application or from admin. The admin sets a risk range on the company. That range is what the company's invoices use until an invoice has its own current assessment.

The admin also sets a match filter: an allow-list of buyer tax ids, an allow-list of products, and an optional risk range. A blank customer list or product list does not restrict that dimension. When the filter risk range is set, the invoice's current range must lie entirely inside it. Saving a filter opts the company in. Until a filter is saved, every invoice for that company stays ineligible for matching. Ineligible invoices remain stored. Eligibility is recomputed when the company range, the filter, or an invoice assessment changes.

### Invoices

An invoice belongs to the selling company. It has an internal id and a document id, usually the NF-e id. The origin country is copied from the company. The currency is assigned by that country's rail. Brazil assigns BRL. The amount is what the buyer is charged in that currency. The product is the good or service on the invoice. A due date and installments are both optional. Installments are an ordered list of sequence, amount, and due date. The buyer can be linked to a directory row, and the invoice also stores the buyer name and tax id so a buyer who is not in the directory still has an identity. On insert, the company's industries and business description are copied onto the invoice.

The sale status is unsold or sold. The lifecycle runs from submitted, through checks, scoring, listing, offer, acceptance, reservation, NFT issue, payout, repayment, and settlement. It can also end declined, expired, or failed. Reserved means RLUSD has moved from the investor's first multisig to the investor's second multisig. Settled means the central issuer has burned the NFT after full repayment.

### Risk ranges

Every risk bound in the system is an integer from 0 to 10000, and the low bound is less than or equal to the high bound. That applies to the company range, the filter range, each assessment, and each bucket band. An assessment is a separate row from the invoice. Many rows can exist. Only one is current. Early rows are wide. Later rows replace them with a tighter range. A component breakdown is optional detail, not the stored score. Buckets keep their own band and are not stored as assessments.

### Bucket mandates and price

An investor bucket sets a risk range, industries, products, countries, and currencies. Risk, industry, and product combine in one of two ways.

And is subtractive. The invoice must pass every criterion the investor filled in. Its current risk range must lie inside the bucket range. If industries are selected, the invoice industry must be one of them. If products are selected, the invoice product must be one of them.

Or is additive. The invoice matches if it passes any filled-in criterion: inside the risk range, or a selected industry, or a selected product.

A blank industry list or product list is not a criterion. Country and currency are always gates, outside that and/or choice. The invoice origin country must be in the bucket's countries, and the invoice currency must be in the bucket's currencies. An empty country list or an empty currency list matches no invoices.

The current risk range is the invoice's own assessment, or the issuing company's admin range when it has none.

The bucket price is an APR. The offer amount the company pays is a simple discount: invoice amount times APR times days divided by 365. Days are the days from the offer to the due date. A lower APR is a lower price for the company and a higher amount paid to them. The matcher keeps one offer per invoice, from the bucket with the lowest price. If more than one investor ties, it picks one of those buckets at random and attaches that investor. Accepting the offer chooses that investor and no other. Replacing the random tie-break is left for later.

Invoices with no due date, including invoices that only have installments, are stored and are not priced. The matcher skips them.

Exposure is one limit, either a flat USD amount or a percent of that investor's portfolio in USD. Each purchase adds the invoice's purchase amount in USD to the amount already used. If the next invoice would push the bucket over the limit, the matcher ignores that bucket for that invoice. The bucket stays active for a later invoice that still fits. Tenor and invoice size remain optional extra constraints.

### The five multisigs and bot wallets

Every accepted investor gets two XRPL multisig accounts. Three central multisigs are created once. Central governance is a signer on every other multisig. There is no shared bot key. Every multisig the backend signs for has its own bot wallet.

Investor multisig 1 is the wallet. Signers are a new bot wallet, the investor's own XRPL account, and central governance. Quorum is 1, so the bot or the investor can authorize a transaction alone. It receives RLUSD deposits, holds invoice NFTs, receives RLUSD repayments, and sends reservation payments.

Investor multisig 2 is the reservation account. Signers are central governance and a second bot wallet, different from the first. Quorum is 1 and is met by that bot alone. It only receives RLUSD reserved from that investor's first multisig. After the backend confirms the sale, that bot sends the funds out through Ripple Payments to pay the company.

Central multisig 1 is governance. It is created once. Its only signer is the funder seed wallet, with quorum 1. It has no bot key. It is the co-owner on the other multisigs. Day-to-day payments do not wait on this quorum.

Central multisig 2 is the issuer. It has its own bot wallet. It mints the invoice NFT to investor multisig 1 when a sale completes, and burns that NFT after the invoice is fully repaid. On XRPL the issuer account is the NFT contract.

Central multisig 3 is repayment. It has its own bot wallet. Incoming invoice repayments arrive through Ripple Payments and are sent on as RLUSD to the investor multisig 1 that holds the matching NFT.

Multisigs are not created when the investor submits the form. Acceptance, or an admin creating the investor directly, enqueues provisioning. A one-time setup does the same for the central issuer and central repayment. Compromising one seed cannot sign any other multisig.

The backend routes work by id. Each ledger job names one bot wallet. Reserve uses that investor's first bot. Disbursement uses their second bot. Mint and burn use the issuer bot. Repayment uses the repayment bot. The seed is encrypted with a master key and stored where only the service role can read it. The web app and the admin screen never receive seeds, only addresses.

Each multisig turns on XRPL deposit authorization. It can receive funds only from the addresses on its own allow-list. An admin can change that list per account.

- Investor multisig 1: the investor's own account, and central repayment.
- Investor multisig 2: that investor's multisig 1.
- Central repayment: the Ripple Payments account for the active country rail.
- Central issuer and central governance: the central funder, so fee XRP can be delivered. No other sender is authorized unless an admin adds one.

### Investor RLUSD and pause

An accepted investor has one screen for RLUSD on multisig 1. It deposits from the investor's own authorized account and withdraws unreserved RLUSD back to that same account. Funds already moved to multisig 2 are not part of this balance.

The same screen pauses and resumes the bot. While paused, the ledger bot does not sign for either of that investor's bot wallets, including new reservations. A withdrawal is only submitted while the bot is paused, so the bot cannot reserve those funds at the same time. The investor's own signer on multisig 1 authorizes the withdrawal. Resuming the bot allows matching again.

### Country rails

Sale perfection, company payment, and repayment are chosen from the invoice's origin country. Brazil is registered and assigns BRL. Each rail assigns the currency, perfects the sale, pays the company, and collects repayment. A new country is a new rail, not a change to matching or to the ledger job types. Invoices, payouts, and ledger jobs store the country code and a method name. Extra rail data goes in an attributes object. Brazil-specific fields are not required columns.

### Admin screens

Admin is a separate area. It is not linked from the landing page. Admin signs in with Supabase Auth. The admin user is created once from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on the server. There is no public admin signup, and there is no shared in-memory store.

From a company or investor profile, admin can open the same screens that party sees. That view is read-only. Accept, sell, deposit, withdraw, bucket edit, and other actions are unavailable.

Admin has one list of every invoice and its lifecycle status. Tokenised invoices show the NFT from mint, through the holder, to burn.

Admin has one page for the risk engine, matcher, ledger bot, payouts, the country rail, and the funder, plus every bot wallet. Each service shows uptime from its heartbeat. Each bot wallet shows remaining XRP and XRP spent on network fees. Admin can fund a wallet by hand. The funder does the same when a wallet falls below its threshold, once that process is running. This slice shows the page and the stored fields.

The ledger-job page lists real jobs. The bot submits `provision_investor_multisigs` and refuses every other job type. The payout page stays an empty state and does not send money.

## What is live

Supabase Auth signs companies and investors in with email and password. Company onboarding writes a pending company. Investor onboarding writes a pending investor and that investor's own XRPL address. Admin can accept either party, stop or allow access, set the company risk range, add a company or investor directly, and open or close new applications. An accepted investor, or one added by admin, gets a queued `provision_investor_multisigs` job.

The ledger bot polls that job. It generates a bot wallet per multisig, encrypts the seed with `BOT_WALLET_MASTER_KEY`, and stores it where only the service role can read it. `XRPL_FUNDER_SEED` pays the XRP reserve from the bot process only. The web app does not read that seed and does not send it to the browser. Provisioning submits `SignerListSet`, deposit authorization, and an RLUSD trust line to the official issuer `rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`. A separate hand-run bootstrap does the same for central governance, the issuer, and repayment. Governance's signer is the `XRPL_FUNDER_SEED` account, with quorum 1. That seed is not copied into `team_signer_keys` or a bot wallet.

The bot records RLUSD deposits into investor multisig 1 when the sender is the investor's own address and the issuer is the official RLUSD issuer. The investor pauses their bot, then signs a withdrawal back to that same address in Xaman. The server checks the pause, the balance, the signer, the destination, and the amount, then submits the investor-signed payment. A pasted signed blob uses the same checks. The bot wallet does not sign the withdrawal.

Buckets are created, edited, paused, and deleted in the database for the signed-in investor.

The invoice scanner is `npm run scan`. It reads `TAURI_API_KEY` from the repo-root environment, or from `apps/web/.env` when the root file does not set it, and POSTs `https://app.tauriagricola.com.br/api/relatorios/get-resumo`. The seller invoice page does not call that API. It lists stored rows. NF-e lookup is not running.

The matcher is `npm run match`. Every 5 minutes it loads unsold, eligible invoices that have received no payment and are due today or later, loads active buckets, and asks `https://api.frankfurter.app/latest?from=BRL&to=USD` once. Exposure uses that rate times the BRL face amount. The rate is not written on the invoice or the offer. The pass writes one open offer per invoice and replaces it when the winner changes. The company can accept the open offer on an invoice. That marks the offer and the invoice accepted and removes the invoice from the next match. It does not sell the invoice, mint an NFT, or send a payment.

## What still refuses

`submitLedgerJob` still refuses every job other than investor provisioning: reserve, sale perfection, NFT mint, company disbursement, repayment, and NFT burn. The package helper `submitTransaction` still throws. Builders for those unsigned payments, mints, and burns do not hold seeds.

Sold, portfolio, connections, risk, and payout screens stay routed and render an empty state. The company dashboard, the admin view of that company, and the invoice list show stored invoices that are still open, and invoices that are already sold. There are no demo companies, investors, invoices, or balances. NF-e lookup, Open Finance, a KYB provider, scoring, NFT mint and burn, sale perfection, Ripple Payments, PIX, and repayment collection are not running. Payouts do not send money. The funder records a threshold and does not send XRP on its own.

## Open questions

These are not decided in this slice.

### BRL, USD, and RLUSD

Invoice amounts are in the invoice currency. Bucket exposure is in USD. Investor funds move as RLUSD. The matcher asks Frankfurter for a BRL to USD rate when it prices exposure. That rate is not locked on the offer. No party is assigned the conversion difference between acceptance and payout.

### Failed steps, refunds, and repayment gaps

Reserve, NFT mint, the sold mark, and company payout can each succeed while the next one fails. There is no refund from multisig 2 back to multisig 1, and no reconciliation that compares a ledger job with the on-chain result. Partial repayment, short pay, and default are also undecided. Invoices with no due date stay unpriced. What to do with them is undecided, so the matcher skips them.

### A better tie-break

When two investors offer the same lowest price, the matcher picks one at random. A later rule should replace that draw. Accepting the offer still binds only the investor on that offer.

### XRPL constraints

Accounts that hold RLUSD need a trust line to the RLUSD issuer. Each multisig needs its own XRP reserve, in addition to the bot wallets the funder tops up. The invoice NFT is not yet specified as non-transferable, so an investor signer could move it off multisig 1. Quorum 1 means that investor's bot key can move unreserved RLUSD on multisig 1 while the bot is not paused. The single master key decrypts every bot seed stored in the database.
