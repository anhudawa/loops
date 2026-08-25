# LOOPS commercial validation plan

Status: pre-registered experiment; no payments may be accepted yet  
Market: Ireland road beta  
Expansion order: Ireland → Girona → Mallorca

## Commercial thesis

LOOPS is not selling a line on a map. It is selling confidence that a road loop
is enjoyable, current, permissioned, personally ridden and suitable for the
rider's available time or specific training session.

There are two hypotheses to test independently:

1. **Rider membership:** frequent riders will pay for trusted workout matching,
   freshness and trip-ready route intelligence after experiencing the route
   library.
2. **Destination/operator product:** cycling operators, accommodation partners,
   shops or destination organisations will pay to give visitors a maintained,
   locally evidenced route product without claiming that an unverified route is
   safe.

A payment validates only the offer that produced it. Ten Irish rider
memberships do not validate a Girona operator product, and an operator pilot
does not prove rider retention.

## Offer boundary

The closed beta remains personal to approved riders. Public route browsing and
a limited basic GPX allowance are candidates for the eventual free layer, not
promises. The paid candidate is:

> Founding membership: €39 for one year, including workout-specific route
> matching, route freshness alerts, saved trip planning and access to the
> reviewed Ireland road catalogue during the founding period.

The exact price, tax treatment, renewal behaviour, cancellation rights, refund
rules and included free allowance require founder, legal and accounting
approval before a checkout is enabled. There is no auto-renewal in the first
experiment unless counsel approves the full renewal flow and wording.

Never sell “safe routes.” The commercial claim is a transparent evidence and
review process with current limitations and incident reporting.

## Rider experiment

### Eligibility

A Wave 3 rider becomes eligible after either:

- three distinct reviewed-route views; or
- one confirmed ride of the exact planned route version.

The offer must not interrupt first use. Each eligible rider receives one
defined offer and remains assigned to that offer for the experiment. Staff,
contributors receiving compensation, test accounts and refunded fraud/test
payments are excluded.

### Funnel definitions

| Step | Counted when |
|---|---|
| Eligible | Rider first satisfies the rule above while their beta membership is active |
| Exposed | The complete price, term, inclusions and cancellation/refund wording is shown |
| Checkout started | The rider intentionally opens the payment provider's checkout |
| Paid | The provider confirms a completed live payment and LOOPS verifies its webhook |
| Refunded | The provider confirms a full refund, reversal or chargeback |
| Net paid | Paid riders minus refunded, reversed and chargeback riders after the observation window |

Primary conversion is net-paid riders divided by eligible active riders—not
email opens, clicks, checkout starts or survey intent.

### Pre-registered decision

Call the initial rider hypothesis **promising**, not proven, only when all are
true:

- at least 30 eligible riders have completed the offer window;
- at least ten are net paid;
- net-paid conversion is at least 10%;
- no critical trust incident is unresolved;
- Ireland's 30% route-action, 25% ride-confirmation and 25% four-week-retention
  gates continue to pass;
- purchaser interviews identify the trusted route/workout job as the reason
  for paying rather than charity or personal support for the founder.

If conversion is below 5% after 50 eligible riders, stop the offer and conduct
interviews before changing price or packaging. Between 5% and 10% is
inconclusive: do not expand geographically on that signal.

## Payment implementation gate

Before collecting one euro:

1. Founder approves the offer, price, free allowance and refund policy.
2. Irish counsel reviews consumer terms, safety claims, cancellation,
   auto-renewal if any, privacy and contributor rights.
3. An accountant confirms VAT/tax and invoice/receipt treatment.
4. A payment provider is contracted in the correct legal entity name.
5. Checkout uses provider-hosted payment collection; LOOPS never stores card
   numbers.
6. Signed webhooks are verified, idempotent and tested for payment, refund,
   reversal and chargeback events.
7. Access derives from the verified payment ledger, not a success-page redirect.
8. Test payments are structurally separated from live demand metrics.
9. Support ownership and the refund/cancellation runbook are live.
10. A data-retention and account-deletion path is tested end to end.

Until all ten pass, the product may collect interview responses but must not
present a working checkout or count stated willingness to pay as revenue.

## Destination/operator experiment

Girona work begins only after the Ireland trust and usage gates pass. The first
operator experiment is a time-boxed paid discovery/pilot, not an indefinite
free partnership.

Pilot scope candidate:

- recruit and verify named local contributors;
- curate 20–30 Girona road loops;
- provide operator-branded discovery access without weakening LOOPS provenance;
- maintain condition reporting and freshness for a defined season;
- supply reviewed GPX and, only if approved, device delivery;
- report aggregate usage without exposing rider-level activity.

Before building custom operator features, complete at least ten discovery
conversations, issue three written pilot proposals with price and scope, and
secure one signed paid pilot or an explicitly time-boxed design partnership
with a named conversion decision and budget owner.

Mallorca waits until the Girona acquisition/review cost, support load and
operator sales motion are measurable and at least two operator relationships
or equivalent recurring revenue exist.

## Unit-economics ledger

For every market, record these costs rather than treating founder time or local
knowledge as free:

- contributor recruitment and compensation;
- curator review and re-review hours;
- route evidence refresh and incident response;
- mapping, routing, geocoding, monitoring and storage;
- payment processing, refunds, chargebacks and support;
- legal, insurance, accounting and tax administration;
- operator sales and onboarding time.

Use these formulas:

```text
net revenue = gross receipts - VAT/tax collected - refunds - chargebacks
contribution margin = net revenue - payment fees - variable map/API costs - variable route/support operations
route acquisition cost = contributor cost + curator cost + allocated recruitment cost
market payback months = launch and route acquisition cost / monthly market contribution margin
```

Do not call the model scalable until route acquisition cost, annual refresh
cost and support cost have been observed in Ireland and again in Girona.

## Evidence retained for each experiment

- offer version, price, inclusions, term and eligibility dates;
- eligible, exposed and checkout-started counts;
- provider-verified payment/refund/chargeback counts and net receipts;
- cohort product metrics and trust incidents;
- anonymised interview themes linked to purchaser/non-purchaser status;
- operating hours and market costs;
- the dated continue/change/stop decision and decision owner.

No result may be redefined after the cohort closes. A new price or package is a
new version and a new cohort.
