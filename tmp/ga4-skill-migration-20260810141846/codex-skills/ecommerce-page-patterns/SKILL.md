---
name: ecommerce-page-patterns
description: "设计、审查和实现电商产品详情页、促销页、专题信息页、产品家族页与落地页。适用于产品页规划、信息架构、交互设计、Webflow 搭建、Figma 转 HTML，以及智能家居与消费电子产品。默认以 EZVIZ 国际站的摄像头、门铃、智能门锁、传感器和全屋智能产品页作为视觉与叙事基底，除非用户指定其他品牌。"
---

# Ecommerce Page Patterns

## Core Use

Use this skill to plan or critique ecommerce pages before building in HTML, Webflow, or Figma. Optimize for clear product understanding, feature proof, purchase confidence, and responsive execution.

For smart-home product detail pages, default to the EZVIZ international-site system. Keep the product category's proof method specific; do not copy an identical long-page layout for every SKU.

使用本 skill 规划或评审电商页面，再落地到 HTML、Webflow 或 Figma。重点是让用户快速理解产品、相信功能、愿意购买，并保证响应式还原。

## Workflow

1. Identify the page type: product detail page, promotion page, topic information/product-family page, or landing page.
2. Identify the product category, primary purchase concern, installation constraint, and regional market.
3. Read the matching reference:
   - Product detail pages: `references/page-types.md`
   - Promotion and sale pages: `references/page-types.md`
   - Topic information and product-family pages: `references/page-types.md`
   - Landing pages: `references/page-types.md`
   - Security camera and smart-home patterns: `references/security-camera-patterns.md`
   - Interaction patterns for dense information and hard-to-explain features: `references/interaction-patterns.md`
   - eufy/Reolink/EZVIZ observations: `references/competitor-observations.md`
   - EZVIZ international product-system baseline: `references/ezviz-product-system.md` for cameras, doorbells, locks, sensors, and connected-home kits.
   - EZVIZ-first interaction-review workflow: `references/ezviz-competitor-review-workflow.md` when the user asks for interaction, UX, conversion, or page-improvement recommendations.
   - Workspace Webflow structure, class naming, and typography: `references/webflow-layout-typography.md` whenever building, reproducing, or revising a Webflow page in the established page system.
4. Extract the user's source assets: screenshots, Figma, PSD export, product renders, specs, copy, price, campaign rules, and target market.
5. Build the page story before styling:
   - hero promise
   - top 4-6 proof points
   - feature storytelling sections
   - comparison/spec/FAQ confidence sections
   - CTA path
6. For Webflow work, read `references/webflow-layout-typography.md`. Preserve the fixed `row > widget > widget_row` base structure and saved typography classes. Build approximately 80% of styling from reusable `u-*` utility classes and reserve component classes for the approximately 20% of feature-specific visual design that utilities cannot express cleanly.
7. Before handoff, check desktop and mobile screenshots for hierarchy, text fit, CTA visibility, image cropping, repeated section fatigue, compatibility clarity, and footnote visibility.

## Bilingual Output Rule

When the user asks for a plan, produce Chinese first and English second only when useful. Keep English concise and operational.

用户要方案时，优先中文；如对接海外设计、文案或 Webflow 命名，再补简短英文版本。

## Default Page Principles

- Put the product and the main benefit in the first viewport.
- Show concrete outcomes before listing specs.
- Use feature modules with visual proof: split views, phone-app UI, scene images, diagrams, comparison sliders, short video loops, or step cards.
- Choose interactions by purpose: use tabs/accordions to compress same-type information; use sliders, drag controls, hotspots, 360 viewers, and simulated app UI to explain functions that text cannot make obvious.
- Repeat CTAs at natural decision points, but do not make every section sales-heavy.
- Use specs, FAQs, reviews, support links, warranty, and storage/privacy explanations to reduce purchase anxiety.
- On mobile, collapse long comparison/spec content into accordions and preserve sticky CTA access.

## EZVIZ Default Baseline

Apply this baseline unless a user provides a different brand system or asks for an intentional departure:

- Use a calm smart-home tone: generous whitespace, white or soft-gray content sections, dark immersive sections only when proving night vision, privacy, or security.
- Lead with a real home situation and a benefit-first headline. Put technical measures in the proof line or feature strip.
- Use a product render or clear lifestyle image in the first viewport. Keep the product visible and identifiable, not merely decorative.
- Sequence the page as a guided story: promise, proof strip, signature feature, smart response/app control, installation and power, privacy/storage, compatibility, specifications and support.
- Use one primary visual proof per feature: real scene, phone UI, comparison slider, coverage overlay, installation diagram, or connected-device flow. Do not repeat generic icon grids.
- State constraints beside the relevant feature: network band, gateway, subscription, regional availability, door fit, battery test condition, or compatible accessory. Use footnotes for test conditions, not as a place to hide purchase-critical limitations.
- Use benefit-first headings. Example: "See every visitor clearly, even at night" followed by "5MP + WDR"; avoid headlines that are only parameters.

For a full category matrix, visual rules, interaction rules, and review checklist, read `references/ezviz-product-system.md`.

## EZVIZ-First Review Rule

When recommending interactions or improvements for a smart-home product detail page, use this order:

1. Inspect the current EZVIZ page for the same product or closest product category. Treat it as the baseline for visual character, narrative sequence, tone, and ecosystem presentation.
2. Identify the buyer task that is unclear, unproven, or hard to complete on the EZVIZ-style page.
3. Consult eufy only for information grouping, quick-intro feature strips, visual rhythm, app/function presentation, and model-comparison layout.
4. Consult Reolink only for technical proof, visual comparison, metric clarity, sticky navigation, information hierarchy, and feature-depth patterns.
5. Recommend the smallest change that solves the buyer task while preserving the EZVIZ base. Do not reproduce competitor layouts or brand styling.

For every recommendation, state: the user understanding problem, the EZVIZ baseline to preserve, the reference pattern to adapt, the proposed information or interaction treatment, and its implementation level (native layout, CSS/JS, or data/content requirement). Prioritize recommendations as P0, P1, or P2. Do not make recommendations about checkout, pricing, delivery, returns, warranties, reviews, or purchase CTAs unless the user explicitly asks for those topics.

## Webflow Translation

For work in the established page system, treat `references/webflow-layout-typography.md` as authoritative. Keep the fixed base classes unchanged, preserve their exact spelling and capitalization, and do not create numbered variants such as `widget 5`, `row 6`, or `Icon-text 8`.

Use this class hierarchy:

1. Fixed structure: `row > widget > widget_row`, with `proudct_webflow_container` where the established page container is required.
2. Reusable utilities for approximately 80% of styling: `u-relative`, `u-absolute`, `u-flex`, `u-flex-center`, `u-grid`, `u-text-white`, `u-width-full`, `u-object-cover`, and token-based spacing utilities.
3. Feature-specific components for approximately 20% of styling: `zoom-indicator`, `coverage-map`, `detection-zone`, `app-alert`, and other designs with unique composition or behavior.
4. Temporary state and behavior hooks: `is-*` for UI state and `js-*` for JavaScript; never style `js-*`.

### Typography Size-Only Variants

When a text variant changes only `font-size`, keep the saved base typography class and add a reusable size Utility. Use:

```text
u-text-{purpose}-{desktop-size}
```

Approved scale:

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

Apply the base typography class first and the size Utility second:

```html
<p class="normal-text u-text-body-16">Body copy</p>
<h2 class="Heading_wf_2 u-text-feature-title-40">Feature title</h2>
```

The size Utility must declare only `font-size`. Keep color, weight, line height, alignment, and responsive visibility in separate classes. Add `u-text-white` or `u-text-muted` for color rather than creating names such as `normal-text--white-16`. Adjust the same size Utility at mobile breakpoints; do not create `*-mobile` classes.

Only add a new size Utility when it belongs to a stable type scale and will be reused by at least two modules. Keep one-off art-directed sizes in a component class. Do not create ambiguous or numbered names such as `font-16`, `fz16`, `text-big`, `normal-text--2`, or `Heading_wf_2--large`.

Prefer native Webflow structure for editable content. Use custom code only for interactions that Webflow cannot maintain cleanly, such as advanced before/after sliders, synchronized scroll animations, or canvas/video effects.

## Common Deliverables

- Page architecture and section order
- Bilingual copy direction
- Webflow section/class plan
- HTML/CSS implementation guidance
- Competitive audit notes
- Product page improvement recommendations
- Topic information and product-family page plans
