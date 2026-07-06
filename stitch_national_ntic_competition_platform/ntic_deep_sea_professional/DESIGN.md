---
name: NTIC Deep-Sea Professional
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#3f4849'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#6f797a'
  outline-variant: '#bec8c9'
  surface-tint: '#1b686d'
  primary: '#004246'
  on-primary: '#ffffff'
  primary-container: '#005b60'
  on-primary-container: '#8bd0d6'
  inverse-primary: '#8dd2d7'
  secondary: '#00696c'
  on-secondary: '#ffffff'
  secondary-container: '#88f0f4'
  on-secondary-container: '#006e71'
  tertiary: '#513600'
  on-tertiary: '#ffffff'
  tertiary-container: '#6f4b00'
  on-tertiary-container: '#ffb93a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a9eef4'
  primary-fixed-dim: '#8dd2d7'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#8bf3f7'
  secondary-fixed-dim: '#6dd6da'
  on-secondary-fixed: '#002021'
  on-secondary-fixed-variant: '#004f52'
  tertiary-fixed: '#ffdeae'
  tertiary-fixed-dim: '#ffba3f'
  on-tertiary-fixed: '#281800'
  on-tertiary-fixed-variant: '#604100'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
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
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  section-gap: 80px
---

## Brand & Style
The brand personality is authoritative, precise, and sophisticated, designed to bridge the gap between rigorous NTIC education and high-end professional data environments. The target audience includes senior researchers, data scientists, and educators who value high-density information presented with technical elegance. 

This design system employs a **Professional Modernism** with **High-Density Focus**. It moves away from soft, airy aesthetics toward a "command center" feel. By utilizing a deep, saturated primary base and high-contrast accents, the UI evokes a sense of deep-sea exploration and analytical power. The emotional response should be one of intense focus, technical mastery, and structural reliability.

## Colors
The palette is anchored by a deep, technical Teal (#005b60) to provide a stable, academic foundation. The neutral palette is shifted toward a sophisticated Slate (#1E293B) for high-contrast text and structural elements. 

- **Primary:** Deep Teal (#005b60) used for primary actions, branding elements, and main navigation headers.
- **Secondary (Cyan):** A bright, high-energy cyan (#73dce0) used for focus states, highlights, and secondary interactive elements to provide visual lift.
- **Tertiary (Amber):** A vivid amber (#ffb100) used sparingly for alerts and critical progress indicators.
- **Neutrals:** Professional slate-greys and deep blues (#1E293B) provide an "instrumentation" feel for borders, text, and disabled states.

## Typography
We utilize **Inter** across all levels for its exceptional legibility and systematic rigor. To maintain a professional, analytical feel, we use standard letter-spacing for body text and tight tracking for large headlines. 

Headlines use semi-bold weights to establish a clear hierarchy within dense data views. The typography system is designed to support long-form research papers and complex data visualizations without visual fatigue, prioritizing vertical rhythm and clear character differentiation.

## Layout & Spacing
The layout follows a **Fluid Grid** model with strict adherence to an 8px spacing scale. We prioritize information density while maintaining logical separation between data modules.

- **Desktop:** 12-column grid with 24px gutters and 40px side margins. Max-width is capped at 1280px to maintain line length readability.
- **Tablet:** 8-column grid with 20px gutters.
- **Mobile:** 4-column grid with 16px margins.
Layouts should be modular, allowing for dashboard-style configurations where information is grouped into distinct, logical containers.

## Elevation & Depth
Depth is achieved through **Tonal Contrast** and **Functional Borders** rather than soft shadows. This reinforces the "instrumentation" aesthetic.

- **Surface 0:** The base background, utilizing the light neutral palette.
- **Surface 1:** High-contrast containers using white or very light slate to pop against the background.
- **Shadows:** Minimal and sharp. Shadows are used only for top-level modals and are desaturated (Slate-tinted) to maintain a sober tone.
- **Borders:** 1px solid lines in the Slate-neutral tone are used to define structure and separate data cells, creating a sense of organized rigor.

## Shapes
The shape language uses **Standardized Geometry** (8px/0.5rem base radius). This provides a professional balance—neither clinical nor overly playful.

- **Small elements (Checkboxes, Tags):** 0.25rem (4px).
- **Medium elements (Buttons, Inputs):** 0.5rem (8px).
- **Large elements (Cards, Modals):** 0.75rem (12px).
Interactive elements maintain a crisp, rectangular presence that fits a professional research environment.

## Components
- **Buttons:** Primary buttons use the deep Teal (#005b60) with white text. Hover states shift toward the Cyan secondary. 
- **Input Fields:** Use a white fill with a 1px Slate border. On focus, the border thickens and changes to Teal. Labels are always positioned above the field.
- **Cards:** White backgrounds with subtle 1px neutral borders. They utilize the 12px rounded corners to differentiate from the sharper internal elements.
- **Chips/Tags:** Rectangular with 4px corners, utilizing high-contrast Teal text on a light Cyan background to denote categories.
- **Progress Bars:** The "track" is a light Slate-grey, while the "filler" is a solid Teal or Amber for alerts. Ends are squared or minimally rounded.
- **Lists:** High-density rows with 1px horizontal dividers in a very light neutral tone to assist eye-tracking across data points.