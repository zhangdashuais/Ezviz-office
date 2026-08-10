# Promotion Page System

Use this reference for seasonal sales, product launches, bundles, and limited-time brand campaigns.

## Page Architecture

1. **Campaign hero**: campaign name, one-line offer, actual deadline when applicable, visual product signal, and primary action.
2. **Category discovery**: anchor navigation or a compact category switcher for doorbells, cameras, bundles, accessories, or other relevant groups.
3. **Deal collection**: scannable cards with offer terms and a clear action.
4. **Bundle logic**: starter, whole-home, or upgrade options with included products and intended use case.
5. **Selection support**: editor picks, a compact comparison, or a need-based guide only when it helps people choose.
6. **Rules and support**: dates, time zone, regions, exclusions, stock, code rules, shipping/returns, and support links.

## Visual Hierarchy

- Make the offer and products visible above the fold; do not use a hero image that obscures both.
- Use a campaign accent color sparingly and retain clear contrast for prices, terms, and actions.
- Establish a stable price hierarchy: final price first, original price second, saved amount third, conditions next.
- Keep product cards consistent in image ratio and content order so cards can be scanned across categories.
- Use full-width bands for campaign story and category groups. Use cards only for repeatable offers, bundles, or editorial picks.

## Offer Disclosure

State the following when relevant:

- Campaign start/end, time zone, and market.
- Eligible products and excluded variants.
- Exact code, minimum purchase, one-use limits, and stacking restrictions.
- Whether price includes tax, shipping, gifts, or subscription requirements.
- Stock limitations and whether a claimed saving is compared against MSRP, regular selling price, or another defined reference.

Place critical terms at the card or offer level. Use the rules section for complete legal detail, not as a substitute for clear offer communication.

## Interaction States

| Pattern | Required states |
| --- | --- |
| Coupon copy | Default, copied confirmation, invalid/unavailable when applicable |
| Category anchor | Default, active section, keyboard focus, mobile overflow handling |
| Deal card | Default, hover/focus, unavailable or sold-out, disabled action when needed |
| Countdown | Confirmed deadline, expired state, time-zone label |
| Product filter | Default, selected, zero results, clear/reset state |
| Rules accordion | Closed, open, keyboard focus, material restriction visible before expansion |

## Competitor Observations

- Reolink activity pages make browsing fast through event framing, category anchors, and dense deal collections.
- eufy activity pages group offers by product category and use codes plus short product actions to speed selection.
- Adapt these patterns to the campaign's actual data and brand system. Do not copy a competitor's visual identity or claim structure.

## Review Checklist

- Can a visitor identify the campaign, saving mechanism, deadline, and eligible products in the first viewport?
- Can they move to the correct product category without a long scroll?
- Is every deal card complete enough to compare without opening multiple pages?
- Are coupon, price, and rule conditions unambiguous at the moment of action?
- Are urgency and saving claims factual and appropriately qualified?
- Do mobile cards, sticky controls, rules, and date labels remain usable and readable?
