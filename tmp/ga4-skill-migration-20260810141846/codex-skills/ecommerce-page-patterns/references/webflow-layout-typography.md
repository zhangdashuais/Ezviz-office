# Webflow Layout, Class, and Typography Baseline

Use this reference whenever building, reproducing, or revising an ecommerce page in the established Webflow page system.

## Fixed Section Structure

Use this hierarchy for every major page section:

```text
row > widget > widget_row
```

Treat this hierarchy as the non-negotiable structural shell. Do not replace it with utility or component classes. Add utilities and feature-specific component classes alongside it.

Use the following HTML pattern and add semantic module classes alongside the fixed base classes:

```html
<section class="row product-feature product-feature--light">
  <div class="widget">
    <div class="widget_row">
      <div class="proudct_webflow_container product-feature__inner">
        <!-- section content -->
      </div>
    </div>
  </div>
</section>
```

Preserve these existing base classes exactly, including capitalization and the existing `proudct` spelling:

```css
.row
.widget
.widget_row
.proudct_webflow_container
.Icon-text
.Head-top-text
.normal-text
.Heading_wf_2
.Heading_1
```

Do not create numbered copies such as `row 6`, `widget 5`, `widget_row 4`, `Icon-text 8`, or `Heading_wf_2 2`. Reuse the digit-free base class and add a semantic module, variant, state, hook, or utility class when extra behavior is needed.

## Base Layout

```css
.row {
  margin-top: 1vw;
  padding-top: 1vw;
  padding-bottom: 0;
  position: relative;
}

.widget {
  text-align: center;
  width: 100%;
  height: auto;
  margin-left: 0;
  margin-right: 0;
  padding-top: 1vw;
  padding-bottom: 1vw;
  display: block;
}

.widget_row {
  width: 100%;
}

.proudct_webflow_container {
  justify-content: center;
  align-items: center;
  max-width: 1140px;
  height: auto;
  min-height: auto;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 1vw;
  padding-bottom: 1vw;
  display: block;
}
```

Use CSS Grid by default for new multi-column sections and rewritten modules. Preserve existing flex or Webflow column structures only when changing a legacy section would add unnecessary risk. Do not use `display: flex` with `flex: 1 1` as the default column system.

## Utility-First Composition

Build the established page system with this target:

```text
approximately 80% reusable properties -> u-* utility classes
approximately 20% special design -> component classes
```

The percentage is a decision heuristic, not a measured quota. Prefer a utility when a property or small property recipe is stable and likely to recur across sections or pages. Create a component class when the design has unique composition, art-directed positioning, or interaction behavior that would become unclear as a long list of utilities.

Use this layer order:

```text
1. fixed structure      row / widget / widget_row / proudct_webflow_container
2. reusable utilities   u-relative / u-absolute / u-flex-center / u-text-white
3. special components   zoom-indicator / coverage-map / detection-zone / app-alert
4. state and behavior   is-active / is-expanded / js-zoom-step
```

Example:

```html
<section class="row">
  <div class="widget">
    <div class="widget_row">
      <div class="proudct_webflow_container">
        <div class="zoom-demo u-relative u-overflow-hidden">
          <img class="u-width-full u-object-cover" src="zoom-scene.jpg" alt="">
          <div class="zoom-indicator u-absolute u-flex-center u-text-white">
            6×
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

### Utility Naming

Use lowercase kebab-case with a mandatory `u-` prefix. Name the CSS responsibility clearly:

```text
position:   u-relative / u-absolute / u-fixed / u-sticky / u-inset-0
display:    u-block / u-flex / u-grid / u-hidden
flex:       u-flex-column / u-flex-wrap / u-items-center / u-justify-center
alignment:  u-text-left / u-text-center / u-text-right
size:       u-width-full / u-height-full / u-max-width-full
media:      u-object-cover / u-object-contain / u-overflow-hidden
color:      u-text-white / u-text-muted / u-bg-white / u-bg-dark
```

Use compact recipe utilities when the same property combination recurs:

```css
.u-flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.u-absolute-fill {
  position: absolute;
  inset: 0;
}

.u-absolute-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
```

Avoid ambiguous names such as `u-center`, `color_white`, or `display-center`. Prefer `u-text-white`, `u-bg-white`, and `u-flex-center`, which state the affected property or recipe.

Build spacing utilities from a limited token scale such as `u-gap-2`, `u-gap-4`, `u-mt-4`, and `u-p-8`. Do not create arbitrary-value utilities such as `u-left-126`, `u-mt-37`, or `u-padding-23`; keep one-off coordinates and art direction inside the relevant component.

Treat utilities as immutable global primitives. Do not change a utility to fix one page. Add or adjust a component class when a local exception is required.

### Component Exceptions

Create a component class for feature-specific visuals such as:

```text
zoom-indicator
coverage-map
detection-zone
app-alert
night-vision-compare
```

Use utilities alongside the component for reusable properties:

```html
<div class="zoom-indicator u-absolute u-flex-center u-text-white">6×</div>
```

Keep values such as `2×`, `6×`, and `12×` as text or data when only the content changes. Add a component variant only when the visual treatment or behavior changes meaningfully, for example `zoom-indicator--mixed` or `zoom-indicator--maximum`.

Use `is-*` only for temporary state and `js-*` only for JavaScript hooks. Do not style `js-*`.

## Typography

Use Roboto globally with a line height of 150%.

| Class | Desktop size | Weight | Mobile size | Weight | Purpose |
| --- | ---: | ---: | ---: | ---: | --- |
| `.Icon-text` | `0.875rem` | 400 | `13px` | 400 | Icon supporting text |
| `.Head-top-text` | `1rem` | 400 | `12px` | 400 | Eyebrow or top heading text |
| `.normal-text` | `1.25rem` | 400 | `14px` | Normal body text |
| `.Heading_wf_2` | `2rem` | 500 | `20px` | Secondary or section heading |
| `.Heading_1` | `3.5rem` | 500 | `24px` | Main heading, primarily in the first section |

Center text by default. Use `.text-align-left`, `.text-align-center`, or `.text-align-right` only for explicit alignment overrides.

### Purpose-and-Size Font Scale

Name each size utility from its intended content role plus its desktop pixel size. This makes the class understandable in Webflow without requiring the designer to remember an abstract `xs`–`5xl` scale. Each utility still controls only `font-size`; keep font family, weight, line height, color, and alignment in their own classes.

| Utility | Desktop | Mobile portrait | Intended use |
| --- | ---: | ---: | --- |
| `.u-text-note-12` | `0.75rem` / 12px | `12px` | Footnotes and legal notes |
| `.u-text-caption-14` | `0.875rem` / 14px | `13px` | Icon labels and captions |
| `.u-text-body-16` | `1rem` / 16px | `14px` | Compact body copy |
| `.u-text-lead-18` | `1.125rem` / 18px | `16px` | Introductory or lead copy |
| `.u-text-card-title-20` | `1.25rem` / 20px | `18px` | Card title or large body copy |
| `.u-text-subtitle-24` | `1.5rem` / 24px | `20px` | Small section heading |
| `.u-text-section-title-32` | `2rem` / 32px | `24px` | Standard section heading |
| `.u-text-feature-title-40` | `2.5rem` / 40px | `28px` | Large feature heading |
| `.u-text-hero-title-56` | `3.5rem` / 56px | `32px` | Hero heading |

```css
.u-text-note-12 { font-size: 0.75rem; }
.u-text-caption-14 { font-size: 0.875rem; }
.u-text-body-16 { font-size: 1rem; }
.u-text-lead-18 { font-size: 1.125rem; }
.u-text-card-title-20 { font-size: 1.25rem; }
.u-text-subtitle-24 { font-size: 1.5rem; }
.u-text-section-title-32 { font-size: 2rem; }
.u-text-feature-title-40 { font-size: 2.5rem; }
.u-text-hero-title-56 { font-size: 3.5rem; }

@media screen and (max-width: 479px) {
  .u-text-note-12 { font-size: 12px; }
  .u-text-caption-14 { font-size: 13px; }
  .u-text-body-16 { font-size: 14px; }
  .u-text-lead-18 { font-size: 16px; }
  .u-text-card-title-20 { font-size: 18px; }
  .u-text-subtitle-24 { font-size: 20px; }
  .u-text-section-title-32 { font-size: 24px; }
  .u-text-feature-title-40 { font-size: 28px; }
  .u-text-hero-title-56 { font-size: 32px; }
}
```

Example:

```html
<h2 class="Heading_wf_2 u-text-feature-title-40">Feature heading</h2>
<p class="normal-text u-text-body-16">Compact supporting copy.</p>
```

The numeric suffix always records the desktop size. Do not create arbitrary classes such as `u-text-body-17`, `font-23`, or `title-big-2`. Choose the nearest defined role and size; keep a truly art-directed one-off size inside the component class.

## Additional Class Naming

Keep the fixed base classes and combine utilities with semantic classes for feature-specific modules:

```text
module
module__element
module--variant
is-state
js-action
u-utility
```

- Use `module` and `module__element` for reusable page components and their parts.
- Use `module--variant` for meaningful visual or functional variants.
- Use `is-*` only for temporary UI state.
- Use `js-*` only as JavaScript hooks; do not style them directly.
- Use `u-*` as the default for repeatable layout, alignment, positioning, sizing, media, color, and token-based spacing properties.
- Use a component class for unique composition, art direction, or interaction behavior.
- Avoid unclear, positional, generated, or numbered names such as `box1`, `img1`, `left`, `_02`, `widget-12`, or `css-xxxx` in new work.
- Leave legacy names in place when renaming them would risk breaking an existing exported page.

## Media Baseline

- Use approximately `1200 × 600` source images for desktop section backgrounds.
- Choose mobile background dimensions from the composition and crop requirements; no fixed mobile size is defined.
