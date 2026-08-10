---
name: promotion-page-design
description: "设计、审查和实现品牌促销活动页、季节大促页、限时优惠页、产品组合页与新品活动落地页。适用于优惠机制梳理、活动信息架构、折扣与优惠码展示、分类导航、商品卡片、套装推荐、规则披露、Webflow 搭建和 Figma 转 HTML。"
---

# Promotion Page Design

Plan or build promotion pages that let visitors understand the offer, find the right product, and see eligibility rules without confusion.

## Workflow

1. Identify the campaign type: seasonal sale, limited-time offer, product launch, bundle, clearance, or lead-generation event.
2. Collect the factual inputs before writing: market, campaign dates and time zone, eligible SKUs, price/discount logic, coupon terms, stock limits, shipping/return rules, legal copy, and destination URLs.
3. Read `references/promotion-page-system.md` for page structure, visual hierarchy, interaction rules, and a review checklist.
   - Read `references/ezviz-mexico-hotsale-2026.md` when planning a multi-retailer, smart-home, or EZVIZ-style promotion page.
   - Read `references/promotion-analytics.md` when the user asks about GA4, GTM, conversion paths, attribution, reporting, or campaign review.
4. Build the campaign story in this order: offer, product discovery, selection support, urgency or proof, and rules.
5. State all material restrictions close to the related offer. Do not use urgency, savings, or stock messages without verifiable campaign data.
6. For Webflow or HTML work, build reusable campaign blocks: hero, category anchor nav, deal card, bundle card, code-copy control, comparison strip, rules accordion, and mobile sticky action.
7. Check desktop and mobile layouts for offer legibility, price hierarchy, code-copy feedback, anchor navigation, rule visibility, text fit, and date/time-zone clarity.
8. Define the measurement plan before launch: product list impressions, product selections, retailer outbound clicks, coupon interactions, and verified downstream sales where a data source exists.
9. When the user provides a promotion-page URL, automatically enter URL measurement-audit mode: inspect the public page structure and outbound destinations, map the user path, identify likely tracking gaps, and propose an event/dataLayer plan. Distinguish this audit from live GA4 data access.

## Default Principles

- Put the campaign name, actual benefit, deadline when real, and the primary action in the first viewport.
- Group products by shopper need or category, not a long unstructured SKU list.
- Keep a deal card scannable: product image, product name, qualifying badge, original price when relevant, final price, saving, coupon condition, and clear action.
- Use one campaign visual direction and make product imagery visible. Avoid decorative hero treatment that hides products or the offer.
- Place full terms near the bottom, but repeat material eligibility constraints beside individual offers.
- Use a countdown only for a confirmed deadline. Use no fake urgency, misleading strike-through price, or unclear "up to" claims.
- Do not treat an outbound marketplace click as a completed purchase. Report click-through and verified sales as separate conversion stages.

## Interaction Rules

- Use a sticky category anchor nav for multi-category campaigns.
- Use filters only when the number of products makes them necessary; do not add filters to a short hand-picked collection.
- Provide coupon copy feedback: copied state, precise code, and a short eligibility hint.
- Use bundle cards to explain who the bundle is for and what is included; avoid forcing a comparison table for simple bundles.
- Use a mobile sticky action only when a single campaign action is clear. For broad sale pages, prefer a compact category switcher.
- Use accordions for long rules and exclusions on mobile. Keep the first material restriction visible before expansion.

## Webflow Class and Typography Rules

For Webflow implementation in the established page system:

1. Preserve the fixed structure `row > widget > widget_row`, with `proudct_webflow_container` where the established container is required. Never create numbered copies such as `row 6`, `widget 5`, or `widget_row 2`.
2. Build approximately 80% of repeated styling with reusable `u-*` utilities. Reserve component classes for the approximately 20% of campaign-specific composition or behavior that utilities cannot express cleanly.
3. Use component naming for campaign blocks: `campaign-hero`, `deal-card`, `deal-card__price`, `deal-card--featured`, and similar `module / module__element / module--variant` patterns.
4. Use `is-*` only for temporary UI state and `js-*` only for script hooks; never place visual styling on `js-*`.

When a text variant changes only `font-size`, combine its saved base typography class with:

```text
u-text-{purpose}-{desktop-size}
```

Use the approved scale:

```text
u-text-note-12
u-text-caption-14
u-text-body-16
u-text-lead-18
u-text-card-title-20
u-text-subtitle-24
u-text-section-title-32
u-text-feature-title-40
u-text-hero-title-56
```

Examples:

```html
<p class="normal-text u-text-body-16">Offer details</p>
<h2 class="Heading_wf_2 u-text-section-title-32">Featured deals</h2>
```

The size Utility must declare only `font-size`. Keep color, weight, line height, alignment, and breakpoint visibility separate. Use the same Utility's mobile breakpoint rather than creating a `*-mobile` class. Only add a new size when it is part of a stable scale and will be reused by at least two modules; keep one-off campaign typography in the relevant component class.

Do not create `font-16`, `fz16`, `text-big`, `normal-text--2`, `Heading_wf_2--large`, or combined names such as `normal-text--white-16`.

## Required Output

For an audit or recommendation, provide Chinese first and include:

- Campaign goal and target audience
- Proposed page structure
- Offer and product-card information hierarchy
- Recommended interactions and states
- Rules, risk, and disclosure requirements
- Asset and data requirements
- Event taxonomy, parameters, validation plan, and reporting funnel when measurement is in scope
- P0/P1/P2 implementation priorities

For detailed patterns and an implementation checklist, read `references/promotion-page-system.md`.
