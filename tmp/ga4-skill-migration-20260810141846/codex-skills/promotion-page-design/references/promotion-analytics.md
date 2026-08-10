# Promotion Page Measurement And Conversion Path

Use this reference whenever a promotion page needs GA4, Google Tag Manager, conversion-path analysis, or a campaign postmortem.

## URL Measurement-Audit Mode

When a user supplies a promotion-page URL, perform this by default:

1. Inspect the public page for campaign sections, product cards, product links, retailer destinations, coupon actions, forms, and likely navigation points.
2. Map the observable user path from campaign arrival to product selection and outbound destination.
3. Identify where generic click tracking cannot identify product, list, placement, retailer, or campaign.
4. Produce a page-specific event map, required `data-*` fields, and GTM/dataLayer implementation plan.
5. State which conclusions are based on the public page and which require GA4/GTM access or test evidence.

### Access Boundaries

| What the user provides | What can be completed |
| --- | --- |
| URL only | Public-page audit, user-path map, recommended events, parameter schema, and implementation guidance |
| URL + editable Webflow/source files | Add or prepare the data attributes and tracking code |
| URL + GTM Preview/GA4 DebugView evidence | Validate whether events and parameters are firing correctly |
| GA4 reporting export or authorized analytics integration | Analyze actual user paths, funnel loss, and post-campaign performance |

Do not claim a live GA4 connection or access to GA4 reports from a public URL alone. Do not ask users to share account passwords, API secrets, or service-account private keys in chat.

## Measurement Principle

Measure the journey in separate, auditable stages:

1. **Exposure**: a product list or campaign module was shown.
2. **Interest**: a user selected a product or copied a coupon.
3. **Outbound intent**: a user clicked a retailer destination.
4. **Verified sale**: a retailer, affiliate network, coupon system, or first-party checkout reports a completed transaction.

Never label stage 3 as a purchase. A campaign page can reliably measure outbound intent; it cannot truthfully measure marketplace purchases without a valid downstream data source.

## Required Event Taxonomy

| Journey step | GA4 event | Purpose |
| --- | --- | --- |
| Campaign page view | `page_view` | Page-level campaign traffic |
| Product collection becomes visible | `view_item_list` | Product exposure by section |
| Product card selected | `select_item` | Identify the exact product and list position |
| Retailer button selected | `campaign_retailer_click` | Track the exact product-to-retailer handoff |
| Coupon copied | `coupon_copy` | Measure code engagement, not redemption |
| In-page promotion selected | `select_promotion` | Optional: campaign banner, gift, or promotion tile |
| Verified retailer sale | Import/offline conversion or API event | Keep verified revenue distinct from clicks |

Use GA4 recommended ecommerce events (`view_item_list`, `select_item`) with the `items` array. This gives GA4 a product identity instead of a generic click label. Google documents these events and their item parameters in its ecommerce measurement guide.

## Minimum Product Payload

Send these standard fields on each item whenever the data exists:

```js
{
  item_id: "CS-H9C-DUAL-3K",
  item_name: "H9c Dual 3K",
  item_brand: "EZVIZ",
  item_category: "Outdoor Camera",
  item_list_id: "featured_products",
  item_list_name: "Productos estrella",
  index: 0,
  price: 1499,
  discount: 400,
  coupon: "",
  item_variant: "Mexico"
}
```

Add only a small, governed set of custom event parameters for campaign reporting:

```text
campaign_id: mx_hotsale_2026
campaign_name: Mexico Hot Sale 2026
retailer: amazon_mx | mercadolibre_mx
card_type: featured | super_discount | retailer_offer
placement: hero | featured_products | amazon_sales | mercado_libre_sales
```

Register only the parameters needed for reports as GA4 custom dimensions. Keep a parameter dictionary; GA4 properties have configuration limits, so do not create a separate dimension for every creative variation.

## Webflow And GTM Implementation Pattern

1. Put one Google Tag Manager container on every campaign page. Avoid duplicate GA4 Google tags.
2. Add stable `data-*` attributes to every product card and retailer button. Do not derive product identity from rendered text alone.
3. Push structured ecommerce data to `dataLayer`; let GTM map it to the GA4 events.
4. Fire `select_item` on product-card selection and `campaign_retailer_click` on the outbound retailer button. Keep the same `item_id` and `campaign_id` in both events.
5. Configure the outgoing retailer URLs with approved campaign/affiliate identifiers. Preserve query parameters through any redirect.
6. Validate in GTM Preview, GA4 DebugView, and a real browser session before launch. Save a test evidence sheet with date, URL, expected event, received parameters, and result.

Example markup and data layer push:

```html
<a
  class="deal-card__buy"
  href="https://www.amazon.com.mx/..."
  data-item-id="CS-H9C-DUAL-3K"
  data-item-name="H9c Dual 3K"
  data-item-category="Outdoor Camera"
  data-price="1499"
  data-discount="400"
  data-list-id="featured_products"
  data-list-name="Productos estrella"
  data-retailer="amazon_mx"
  data-campaign-id="mx_hotsale_2026"
>
  Comprar
</a>
```

```js
window.dataLayer = window.dataLayer || [];

document.addEventListener("click", (event) => {
  const link = event.target.closest(".deal-card__buy");
  if (!link) return;

  const item = {
    item_id: link.dataset.itemId,
    item_name: link.dataset.itemName,
    item_brand: "EZVIZ",
    item_category: link.dataset.itemCategory,
    item_list_id: link.dataset.listId,
    item_list_name: link.dataset.listName,
    price: Number(link.dataset.price),
    discount: Number(link.dataset.discount || 0),
    quantity: 1
  };

  window.dataLayer.push({
    event: "select_item",
    currency: "MXN",
    item_list_id: item.item_list_id,
    item_list_name: item.item_list_name,
    items: [item],
    campaign_id: link.dataset.campaignId,
    retailer: link.dataset.retailer,
    placement: item.item_list_id
  });

  window.dataLayer.push({
    event: "campaign_retailer_click",
    campaign_id: link.dataset.campaignId,
    retailer: link.dataset.retailer,
    placement: item.item_list_id,
    items: [item]
  });
});
```

Use a GTM Custom Event trigger for both dataLayer events. Do not rely only on GA4 enhanced-measurement `click`: it captures outbound links but does not automatically attach the product identity and placement required for product-level analysis.

## Multi-Retailer Attribution

- Use a stable `item_id` for a product across Amazon, Mercado Libre, and first-party destinations.
- Keep `retailer`, `campaign_id`, `placement`, and `card_type` consistent across all events.
- Add permitted affiliate or retailer sub-IDs to outbound links. Map each sub-ID to campaign, product, section, and retailer.
- Import or join verified sales from affiliate reports, retailer APIs, coupon reports, or first-party checkout exports using the same stable identifiers where possible.
- Configure GA4 cross-domain measurement only for domains controlled by the business and tagged with the same Google tag. Do not use it to claim marketplace purchase tracking.

## Reporting Funnel

Build campaign reporting around these ratios:

```text
Product list exposure -> product selection -> retailer click -> verified sale
```

Segment each stage by campaign, retailer, product, product list, card type, device, source/medium, and date. Keep two outcome tables:

1. **On-page behavior**: exposure, selections, coupon copies, and outbound clicks.
2. **Verified commercial outcome**: orders, revenue, return/cancellation state, and commission where available.

This separation prevents a high click-through rate from being misreported as high sales performance.

## Launch And Postmortem Checklist

- One GTM container and one GA4 Google tag per page; no duplicate `page_view` events.
- Every product card has a stable product ID and list/placement ID.
- `view_item_list`, `select_item`, and `campaign_retailer_click` include the expected product and campaign parameters.
- Currency uses ISO 4217 format, for example `MXN`.
- Outbound redirects preserve permitted attribution parameters.
- Consent and privacy behavior are configured for the target market before analytics fires.
- GTM Preview and GA4 DebugView evidence is saved before launch.
- Post-campaign data joins are documented, deduplicated, and labeled as click data or verified sale data.
