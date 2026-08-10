---
name: topic-page-design
description: "设计、审查和实现专题信息页、产品家族页、技术主题页、场景解决方案页与多产品内容页。适用于以一个主题、技术、场景或产品系列组织信息，同时提供产品了解、比较和购买入口的页面；支持信息架构、交互设计、Webflow 搭建与 Figma 转 HTML。"
---

# Topic Page Design

Use this skill for topic-led pages that educate a visitor before helping them select from multiple related products. These pages are neither a single-SKU product detail page nor a price-led promotion page.

## Choose The Page Type

Use a **product detail page** when one SKU is the story and the visitor needs feature proof, fit, and specifications.

Use a **promotion page** when a campaign, price, deadline, or offer is the story and fast deal discovery is the priority.

Use a **topic information page** when a shared technology, product family, use case, or solution is the story and multiple products are candidates. A purchase or Learn More button may appear, but it supports the information journey rather than leading it.

## Workflow

1. Define the topic: product family, technology, use case, environment, or solution.
2. Identify the audience's decision question, such as "Which series fits my property?" or "Why does 4G plus Wi-Fi matter?"
3. Collect the common technology claims, product family taxonomy, differentiation data, product links, target market, and permitted purchase paths.
4. Read `references/topic-page-system.md` for architecture, interaction, analytics, and review guidance.
   - Read `references/ezviz-4g-wifi-battery-camera-family.md` when planning an EZVIZ-style product-family or technology topic page.
5. Build the story in this order: theme promise, common technology proof, series differentiation, product selection, comparison, FAQ, and optional product actions.
6. Keep direct purchase actions contextual. Use Learn More, Compare, Check Compatibility, or Where to Buy when the visitor still needs product guidance.
7. Check desktop and mobile hierarchy, sticky navigation, product-card readability, comparison usability, technical claim disclosure, and whether purchase actions interrupt the information journey.

## Default Principles

- Lead with the shared outcome, not a SKU name or discount.
- Explain shared technology once, then show why each series benefits differently.
- Segment product families by a meaningful buyer need, such as budget, coverage area, installation environment, or security requirement.
- Use a product recommendation section and a clear comparison after education, not before it.
- Keep a product card focused on who it is for, its decisive capabilities, and the next information action.
- Use buying actions as secondary or product-level actions unless the page has a truly unified purchase goal.
- Put limitations close to technical claims: network requirements, solar compatibility, storage variation, regional availability, and conditions for stated performance.

## Interaction Rules

- Use a sticky topic subnav for long pages: Overview, Technology, Series, Compare, FAQ.
- Use tabs, hotspots, or concise scrollytelling to explain shared technologies; do not use motion without explanatory value.
- Use series cards or a need-based selector to route visitors into the right product family.
- Use a comparison matrix with a fixed first column on desktop and a product selector or accordion on mobile.
- Use product-card actions that preserve context: Learn More, Compare, View Specs, or Where to Buy.
- Track content progression separately from purchase intent: technology views, series selections, comparison use, product selections, and outbound retailer actions.

## Webflow Class and Typography Rules

For Webflow implementation in the established page system:

1. Preserve the fixed structure `row > widget > widget_row`, with `proudct_webflow_container` where the established container is required. Never create numbered copies such as `row 6`, `widget 5`, or `widget_row 2`.
2. Build approximately 80% of repeated styling with reusable `u-*` utilities. Reserve component classes for the approximately 20% of topic-specific composition or behavior that utilities cannot express cleanly.
3. Use component naming for topic modules: `technology-story`, `technology-story__media`, `series-card`, `series-card--featured`, and similar `module / module__element / module--variant` patterns.
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
<p class="normal-text u-text-body-16">Technology explanation</p>
<h2 class="Heading_wf_2 u-text-feature-title-40">Shared technology</h2>
```

The size Utility must declare only `font-size`. Keep color, weight, line height, alignment, and breakpoint visibility separate. Use the same Utility's mobile breakpoint rather than creating a `*-mobile` class. Only add a new size when it is part of a stable scale and will be reused by at least two modules; keep one-off topic typography in the relevant component class.

Do not create `font-16`, `fz16`, `text-big`, `normal-text--2`, `Heading_wf_2--large`, or combined names such as `normal-text--white-16`.

## Required Output

For a review or build plan, provide Chinese first and include:

- Topic definition and page-type rationale
- Page structure and information hierarchy
- Product-family segmentation and selection logic
- Core technology proof modules and interactions
- Product-card and comparison design
- Purchase-action placement and analytics event plan
- Assets, factual dependencies, and P0/P1/P2 priorities
