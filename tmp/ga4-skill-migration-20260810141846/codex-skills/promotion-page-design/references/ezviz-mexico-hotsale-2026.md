# EZVIZ Mexico Hot Sale 2026

- URL: https://campaigns.ezviz.com/mexico-hotsale-2026
- Market: Mexico
- Build context: Webflow page supplied by the user.
- Capture date: 2026-07-11

## Why This Is A Reference

Use this as an EZVIZ-style reference for a multi-retailer smart-home campaign. The page balances featured products, high-discount products, retailer-specific deal sections, and a closing EZVIZ App ecosystem module.

## Information Architecture

1. Top anchors: `Destacados`, `Superofertas`, `Explorar más`, `¿Por qué EZVIZ?`.
2. Featured products: H9c Dual 3K, H8c Pro 4K, C6N G1 4K, and DL05. Each card pairs discount, before/final price, several proof bullets, and an outbound retailer action.
3. Super-discount collection: compact product cards for stronger-discount offers.
4. Retailer sections: Amazon Sales and Mercado Libre Sales. Each labels its own campaign dates and lists retailer-linked products.
5. Brand/App close: active-user and connected-device statistics, then EZVIZ App capabilities such as quick device addition, grouping, remote control, alerts, playback, and privacy settings.

## Reusable Patterns

- Use a short anchor list to make a long campaign scannable before visitors reach product cards.
- Give hero or featured cards a fuller feature proof list; use compact cards in dense deal sections to preserve scanning speed.
- Separate retailer groups when date windows, inventory, URLs, or terms differ. Place the retailer date directly under that group heading.
- Allow repeated models across a feature section and a retailer section only when the offer context is different. Keep each card's retailer destination and price condition explicit.
- Close with an ecosystem or app proof module when connected-device ownership is a brand-level differentiator.

## Use With Care

- Label currency explicitly in any future implementation; a Mexico-only page should not rely on `$` alone to establish currency.
- Add date time zone and offer exclusions when campaign terms require them.
- Make retailer-specific availability and price changes clear, since outbound marketplace prices can change independently.
- Keep a long product list accessible on mobile with an active anchor state and sufficient card spacing.

## Measurement Follow-Up

The page currently sends visitors to Amazon Mexico and Mercado Libre. Generic GA4 outbound-click tracking can show that a link was clicked, but product-level reporting requires each product card and retailer action to send a structured `select_item` / `campaign_retailer_click` payload with stable `item_id`, `item_name`, `item_list_id`, `retailer`, and `campaign_id` values. See `promotion-analytics.md` for the implementation and review process.
