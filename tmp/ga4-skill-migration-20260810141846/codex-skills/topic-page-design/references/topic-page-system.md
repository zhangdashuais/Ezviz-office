# Topic Information Page System

## Page Architecture

1. **Topic hero**: shared promise, family name, key technology proof points, and a visual showing the environment or family.
2. **Topic navigation**: Overview, Core Technology, Series, Compare, FAQ. Use a sticky subnav for long pages.
3. **Shared technology story**: explain the common platform through real scenes, diagrams, video, app UI, or concise interactive modules.
4. **Series segmentation**: group products by buyer need, not merely resolution or SKU order.
5. **Series detail cards**: show who each series is for, its decisive benefits, included products, and Learn More / Compare actions.
6. **Proof or ecosystem module**: awards, app, compatibility, installation ecosystem, or credible use cases.
7. **Find your best one**: product family cards followed by a comparison matrix with scannable differences.
8. **FAQ and next step**: resolve technology and fit questions, then offer product-level actions.

## Information Hierarchy

- Teach one shared concept before asking people to choose among products.
- Present series in a stable hierarchy: entry/essential, premium/performance, specialist/coverage or another meaningful taxonomy.
- Make each series distinct in three dimensions: ideal user or site, decisive proof, and the trade-off it accepts.
- Do not repeat every product specification in series cards. Reserve exhaustive specs for a comparison or product detail page.
- Keep price or purchase information subordinate unless the page is intentionally a campaign page.

## Interaction Patterns

| Need | Pattern |
| --- | --- |
| Explain one abstract technology | Tabbed demonstrations, hotspot diagram, video chapters, or scrollytelling with one active message at a time |
| Help visitors choose a series | Need-based selector or three-series cards with a clear "best for" statement |
| Compare related models | Sticky-column comparison table on desktop; selected-model comparison or accordions on mobile |
| Keep a long page navigable | Sticky subnav with active section state |
| Preserve the information journey | Product-level Learn More/Compare actions; purchase actions after a fit is established |
| Explain uncertainty | FAQ with direct links to model specs and compatibility facts |

## Analytics Plan

Track the content journey as well as product interest:

```text
topic_page_view -> technology_module_view -> series_select -> comparison_use -> product_select -> learn_more / retailer_click
```

Use stable values such as `topic_id`, `technology_id`, `series_id`, `item_id`, `placement`, and `action_type`. Do not count a series card in view as a product purchase intent until the visitor selects a product action.

## Review Checklist

- Is the page clearly about a theme or product family rather than an unstructured product listing?
- Is the shared technology explained before product choice?
- Can a visitor identify which series fits their need without reading the full comparison table?
- Do comparison and mobile interactions preserve readability?
- Are product CTAs appropriate to the visitor's information state?
- Are technical dependencies and performance conditions stated next to the relevant claims?
