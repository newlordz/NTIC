---
name: Clinical Clarity
colors:
  surface: '#f3faff'
  surface-dim: '#c7dde9'
  surface-bright: '#f3faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#e6f6ff'
  surface-container: '#dbf1fe'
  surface-container-high: '#d5ecf8'
  surface-container-highest: '#cfe6f2'
  on-surface: '#071e27'
  on-surface-variant: '#424752'
  inverse-surface: '#1e333c'
  inverse-on-surface: '#dff4ff'
  outline: '#727784'
  outline-variant: '#c2c6d4'
  surface-tint: '#115cb9'
  primary: '#003f87'
  on-primary: '#ffffff'
  primary-container: '#0056b3'
  on-primary-container: '#bbd0ff'
  inverse-primary: '#acc7ff'
  secondary: '#006a60'
  on-secondary: '#ffffff'
  secondary-container: '#85f6e5'
  on-secondary-container: '#007166'
  tertiary: '#36444c'
  on-tertiary: '#ffffff'
  tertiary-container: '#4d5b64'
  on-tertiary-container: '#c3d2dd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#acc7ff'
  on-primary-fixed: '#001a40'
  on-primary-fixed-variant: '#004491'
  secondary-fixed: '#85f6e5'
  secondary-fixed-dim: '#67d9c9'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005048'
  tertiary-fixed: '#d6e5ef'
  tertiary-fixed-dim: '#bac9d3'
  on-tertiary-fixed: '#0f1d25'
  on-tertiary-fixed-variant: '#3b4951'
  background: '#f3faff'
  on-background: '#071e27'
  surface-variant: '#cfe6f2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin: 32px
---

## Brand & Style
The design system is rooted in the **Corporate / Modern** aesthetic with a specific focus on healthcare reliability. It prioritizes a "clinical-chic" atmosphere: sterile but not cold, professional but accessible. The visual language conveys security, precision, and empathy through generous whitespace and a highly structured information hierarchy.

The brand personality is authoritative and calm. It avoids visual clutter to reduce cognitive load for users who may be in high-stress medical environments. The style utilizes soft-edged containers and subtle tonal shifts to create a sense of organized care and technological sophistication.

## Colors
The palette is built on a foundation of high-contrast legibility. 
- **Primary Blue (#0056B3):** Used for primary actions, navigation headers, and critical brand touchpoints. It represents stability and institutional trust.
- **Secondary Teal (#009688):** Employed for success states, secondary features, and subtle accents to provide a modern healthcare feel.
- **Soft Blue/Gray Backgrounds:** We use a tiered neutral system. The main background is pure white (#FFFFFF), while container surfaces use subtle grays (#F8FAFC) or light teal tints (#F0F9FF) to separate content sections without using harsh lines.
- **Functional Colors:** Error states must use a clear, high-visibility red (#D32F2F) to ensure patient safety and data integrity are never overlooked.

## Typography
This design system utilizes **Inter** exclusively to ensure maximum legibility and a systematic, utilitarian feel. The hierarchy is strictly enforced to guide the user's eye through complex medical data.

Headlines use tighter letter-spacing and heavier weights to feel "anchored" and authoritative. Body text preserves a standard line height of 1.5x the font size to ensure long-form medical reports or patient instructions remain easy to read for users of all ages. Labels are often treated with a medium or semi-bold weight to distinguish them from data values.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a max-width of 1440px for desktop applications. It utilizes an 8px base unit for all spacing decisions, ensuring mathematical harmony across the UI.

- **Desktop (1024px+):** 12-column grid with 24px gutters.
- **Tablet (768px - 1023px):** 8-column grid with 16px gutters.
- **Mobile (Up to 767px):** 4-column grid with 16px margins.

Spacing density is kept "moderate" to maintain a clean, clinical feel. Cards and sections should use the `lg` (48px) spacing for vertical separation to allow the UI to "breathe," reducing the perceived complexity of the medical software.

## Elevation & Depth
Elevation in this design system is primarily conveyed through **Tonal Layers** and **Soft Ambient Shadows**. 

1.  **Level 0 (Background):** Pure white or very light gray (#F8FAFC).
2.  **Level 1 (Cards/Containers):** White background with a 1px border (#E2E8F0) and an extremely soft, diffused shadow (0px 4px 20px rgba(0, 0, 0, 0.04)).
3.  **Level 2 (Popovers/Modals):** White background with a more pronounced shadow (0px 10px 30px rgba(0, 86, 179, 0.08)) to indicate significant interaction depth.

We avoid heavy blacks in shadows, opting for a primary-tinted blue shadow to maintain the clean, "water-clear" aesthetic seen in healthcare environments.

## Shapes
The shape language is consistently **Rounded**. This softens the "clinical" edge of the product, making it feel more approachable for patients while remaining professional for clinicians.

- Standard buttons and input fields use the `rounded` (0.5rem) setting.
- Feature cards and high-level containers use `rounded-lg` (1rem).
- Specialized items like Status Badges (Chips) and Search Bars use the "Pill" (Full radius) treatment to provide visual variety and signify interactable "touch" targets.

## Components
- **Buttons:** Primary buttons use the brand blue with white text and a 0.5rem corner radius. Secondary buttons should be "ghost" style with a primary blue border and transparent background.
- **Inputs:** Text fields feature a subtle background tint (#F1F5F9) and a 1px border that shifts to Primary Blue on focus. Labels should always be visible above the field (not floating).
- **Cards:** Cards are the primary organizational unit. They must have a 1rem corner radius and a very light shadow. High-priority cards (e.g., "Active Appointment") can use a 4px left-border accent in the Primary Blue.
- **Chips:** Used for medical tags or status (e.g., "Confirmed," "Pending"). They use a soft background fill version of the status color with high-contrast text.
- **Lists:** Data tables and lists should use "Zebra Striping" with a very faint gray (#F8FAFC) every second row to assist in tracking information horizontally.
- **Data Visualization:** Use a clean, thin-stroke line for charts, sticking to the primary and secondary color palettes. Avoid complex gradients; prefer solid, high-contrast fills for clarity.