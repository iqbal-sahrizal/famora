# Famora — Premium Design System Specification

## 1. Design Direction & Aesthetic Philosophy

Famora is a **premium lifestyle product** for modern families—warm, tactile, human-centered, and effortlessly calm. It draws inspiration from Apple's spatial clarity, modern fintech precision (clean tabular data and soft visual hierarchy), and Notion's calm organizational simplicity.

### Core Design Rules
- **Warm & Tactile**: Soft organic surfaces (`#F7F5EF`), deep botanical anchoring (`#315C49`), and gentle pastel accents (`#DCE8D9`, `#E9B98B`, `#E9DDF5`, `#F3D9D1`).
- **Avoid Repetitive Card Grids**: Mix editorial hero summaries, horizontal timelines, split-pane lists, and airy metric strips rather than uniform 3-column card walls.
- **Avoid Excessive Borders**: Use subtle tonal surface shifts (`--bg-surface` on `--bg-canvas`, or `--bg-subtle`) and soft elevation instead of heavy 1px boxes everywhere.
- **Intentional Whitespace**: Generous padding (`20px–28px` inside major surfaces, `24px–40px` section rhythm).
- **Consistent Iconography**: Crisp `lucide-react` stroke icons (`1.75px` stroke weight). **Never use emojis as primary UI icons.**
- **Subtle Motion**: Smooth `180ms–240ms` `cubic-bezier(0.22, 1, 0.36, 1)` transitions; respect `prefers-reduced-motion`.

---

## 2. Color System & Semantic Tokens

### Brand & Palette Foundation
| Swatch | Hex | Role |
| :--- | :--- | :--- |
| **Warm White** | `#F7F5EF` | Primary Light Canvas |
| **Charcoal** | `#282C29` | Primary Light Ink / Dark Surface Anchor |
| **Forest Green** | `#315C49` | Primary Brand Action & Botanical Anchor |
| **Sage Green** | `#DCE8D9` | Soft Positive / Nature / Wellness Tint |
| **Soft Peach** | `#E9B98B` | Warmth / Rewards / Streaks / Meal Accent |
| **Muted Lavender** | `#E9DDF5` | Calm / Child Dev / AI & Habits Accent |
| **Soft Blush** | `#F3D9D1` | Care / Memories / Gentle Alert Tint |

### Light & Dark Semantic Tokens

| Semantic Token | Light Mode | Dark Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#F7F5EF` | `#161917` | Main application background |
| `--bg-surface` | `#FFFFFF` | `#1F2320` | Elevated cards, sheets, dialogs |
| `--bg-subtle` | `#EFECE4` | `#282C29` | Inputs, muted pills, secondary surfaces |
| `--bg-hover` | `#E8E4DA` | `#323734` | Interactive hover states |
| `--text-primary` | `#282C29` | `#F7F5EF` | Headings & primary body copy |
| `--text-secondary` | `#5E645F` | `#B5BCB7` | Subtitles, metadata, labels |
| `--text-muted` | `#848A85` | `#848B86` | Placeholders, disabled text |
| `--border-subtle` | `rgba(40, 44, 41, 0.08)` | `rgba(247, 245, 239, 0.10)` | Hairline dividers when needed |
| `--border-strong` | `rgba(40, 44, 41, 0.16)` | `rgba(247, 245, 239, 0.18)` | Focus rings & active inputs |
| `--accent-primary` | `#315C49` | `#528C72` | Primary CTAs, active nav, key highlights |
| `--accent-primary-fg` | `#F7F5EF` | `#121513` | Text on primary accent |
| `--tint-sage` | `#DCE8D9` | `rgba(220, 232, 217, 0.14)` | Success / Wellness / Positive trend |
| `--tint-sage-fg` | `#234234` | `#BFE0B7` | Text on sage tint |
| `--tint-peach` | `#E9B98B` | `rgba(233, 185, 139, 0.16)` | Warmth / Streaks / Pending |
| `--tint-peach-fg` | `#5C3B1C` | `#F2CCA6` | Text on peach tint |
| `--tint-lavender` | `#E9DDF5` | `rgba(233, 221, 245, 0.14)` | AI / Habits / Child Dev |
| `--tint-lavender-fg` | `#46325C` | `#D7C3EE` | Text on lavender tint |
| `--tint-blush` | `#F3D9D1` | `rgba(243, 217, 209, 0.15)` | Care / Memories / Soft Warning |
| `--tint-blush-fg` | `#633226` | `#F0C6BA` | Text on blush tint |
| `--status-danger` | `#C2413B` | `#E56B65` | Destructive actions & SOS |

---

## 3. Typography System

- **Headings**: `Plus Jakarta Sans` (weights `500`, `600`, `700`; tight tracking `-0.02em` on display).
- **Body & UI**: `Inter` (weights `400`, `500`, `600`).
- **Financial & Numeric Values**: `font-variant-numeric: tabular-nums` (`tabular-nums`) on all currency, counts, percentages, and timers so columns align cleanly.

| Token | Desktop Size | Mobile Size | Line Height | Weight | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-lg` | `36px` (`2.25rem`) | `28px` (`1.75rem`) | `1.15` | `700` | Editorial greetings, hero totals |
| `heading-xl` | `28px` (`1.75rem`) | `24px` (`1.5rem`) | `1.2` | `600` | Page titles |
| `heading-lg` | `20px` (`1.25rem`) | `18px` (`1.125rem`) | `1.3` | `600` | Section headers |
| `heading-md` | `17px` (`1.0625rem`) | `16px` (`1rem`) | `1.35` | `600` | Card / Sheet titles |
| `body-md` | `15px` (`0.9375rem`) | `15px` | `1.55` | `400` | Primary reading text |
| `body-sm` | `13.5px` (`0.84375rem`) | `13.5px` | `1.45` | `400` | Secondary copy, table cells |
| `caption` | `12px` (`0.75rem`) | `12px` | `1.35` | `500` | Badges, timestamps, axis labels |

---

## 4. Spacing, Radius & Elevation

- **Spacing Scale** (`4px` base): `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`.
- **Border Radius**:
  - `sm`: `8px` (badges, small chips)
  - `md`: `12px` (buttons, inputs, dropdown items)
  - `lg`: `18px` (cards, table containers)
  - `xl`: `24px` (dialogs, bottom sheets, hero panels)
  - `full`: `9999px` (pills, avatars, toggles)
- **Elevation**: Subtle diffused shadows in light mode (`0 4px 20px -2px rgba(40, 44, 41, 0.05)`) and hairline luminance borders in dark mode.

---

## 5. Component Specifications

All 19 required components are implemented in `famora/src/components/ui/` and demonstrated in `/design-system`:
1. **Buttons** (`primary`, `secondary`, `tonal`, `ghost`, `danger`; sizes `sm`, `md`, `lg`, `icon`; loading & disabled states)
2. **Inputs** (text, search, currency with tabular prefix, validation error & helper text)
3. **Selects** (styled accessible select with label & hint)
4. **Dropdowns** (contextual action menu with keyboard escape/click-outside)
5. **Dialogs** (centered modal with backdrop blur, focus trap/escape, header/footer)
6. **Bottom Sheets** (mobile-first slide-up drawer with drag handle)
7. **Cards** (`elevated`, `tonal-sage`, `tonal-peach`, `tonal-lavender`, `tonal-blush`, `outline`)
8. **Avatars** (`sm`, `md`, `lg`, `xl` + `AvatarStack` with role indicator)
9. **Badges** (`neutral`, `sage`, `peach`, `lavender`, `blush`, `forest`, `danger`)
10. **Navigation** (responsive desktop sidebar + mobile bottom tab bar + segmented pills)
11. **Tabs** (animated pill/underline tab switcher)
12. **Tables** (clean borderless-feel ledger table with `tabular-nums` alignment)
13. **Charts** (custom SVG fintech-inspired area/bar sparklines & budget progress rings with tooltips)
14. **Date Pickers** (warm interactive calendar popover + native accessible fallback)
15. **Toasts** (via `sonner` styled with Famora tokens)
16. **Tooltips** (accessible hover/focus micro-hints)
17. **Skeletons** (warm shimmer placeholders for cards, rows, avatars)
18. **Empty States** (icon, warm headline, concise guidance, primary CTA)
19. **Error States** (calm recovery banner/panel with retry action)

---

## 6. Interaction, Responsive & Accessibility Guidelines

- **Interaction**: Optimistic feedback on toggles/checks; `scale(0.98)` active press on buttons; `200ms` ease-out transitions.
- **Responsive**: Mobile-first (`< 768px` bottom nav + bottom sheets), Tablet (`768px–1023px` collapsible rail), Desktop (`>= 1024px` 260px sidebar + `1280px` max content width).
- **Accessibility (WCAG 2.1 AA)**:
  - Contrast ratio >= `4.5:1` for all text/foreground pairings in both Light (`#282C29` on `#F7F5EF` = `12.6:1`) and Dark (`#F7F5EF` on `#161917` = `14.5:1`) modes.
  - Visible `2px` `#315C49` / `#528C72` focus-visible rings on all interactive elements.
  - Minimum `44x44px` touch targets on mobile controls.
  - Full `aria-label`, `role`, and keyboard navigation (`Escape`, `Tab`, `Enter`) support.
