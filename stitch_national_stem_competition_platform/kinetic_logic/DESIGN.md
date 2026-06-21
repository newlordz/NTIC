---
name: Kinetic Logic
colors:
  surface: '#091421'
  surface-dim: '#091421'
  surface-bright: '#303a48'
  surface-container-lowest: '#050f1c'
  surface-container-low: '#121c2a'
  surface-container: '#16202e'
  surface-container-high: '#212b39'
  surface-container-highest: '#2b3544'
  on-surface: '#d9e3f6'
  on-surface-variant: '#c2c7c8'
  inverse-surface: '#d9e3f6'
  inverse-on-surface: '#27313f'
  outline: '#8c9293'
  outline-variant: '#424849'
  surface-tint: '#a9c7ff'
  primary: '#a9c7ff'
  on-primary: '#003063'
  primary-container: '#002854'
  on-primary-container: '#5290ea'
  inverse-primary: '#085db4'
  secondary: '#bfc7d4'
  on-secondary: '#29313b'
  secondary-container: '#424a55'
  on-secondary-container: '#b1b9c6'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#002f1e'
  on-tertiary-container: '#00a371'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a9c7ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#00468b'
  secondary-fixed: '#dbe3f1'
  secondary-fixed-dim: '#bfc7d4'
  on-secondary-fixed: '#141c26'
  on-secondary-fixed-variant: '#3f4752'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#091421'
  on-background: '#d9e3f6'
  surface-variant: '#2b3544'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 57px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: '0'
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.15px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.5px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.25px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.5px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

This design system is engineered for high-stakes STEM competition environments and structured learning management. The brand personality is **analytical, precise, and empowering**, designed to fade into the background so that complex data and student achievements remain the focal point.

The aesthetic follows a **Corporate Modern** approach with heavy inspiration from **Material 3 (M3)** logic, focusing on containment, clear hierarchies, and state-driven visuals. The interface should feel like a sophisticated laboratory tool: reliable, fast, and technically advanced. We prioritize functional clarity over decorative flair, using whitespace and structural lines to organize dense information into digestible modules.

The design system must maintain a high level of "intellectual comfort," ensuring that users—from students solving physics problems to administrators managing multi-tenant data—experience zero cognitive friction.

## Colors

The palette is rooted in **High-Contrast Technical Blue** to establish a professional, "engineering-grade" atmosphere. 

- **Primary & Secondary:** These are used for structural elements, sidebars, and deep backgrounds. In Dark Mode, `#1F2937` serves as the primary container background, while `#0A5EB5` is used for primary actions and active navigation states. The secondary `#E8F0FE` provides high-contrast legibility for text and icons.
- **Vibrant Emerald (#10B981):** This is a high-significance accent color. It is reserved strictly for **positive outcomes**: 100% completion, "Passed" statuses, "Correct" answers, and active progress bars. It should never be used for primary branding or generic buttons to preserve its semantic meaning.
- **Structural Lines:** Use low-opacity tints of the neutral color for borders. In Dark Mode, use `rgba(255, 255, 255, 0.1)`. In Light Mode, use `rgba(0, 0, 0, 0.08)`.
- **Status Mapping:** 
    - Success: Emerald (#10B981)
    - Warning: Amber (#F59E0B)
    - Error: Crimson (#EF4444)
    - Info: Blue (#0A5EB5)

## Typography

This design system utilizes **Inter** as the primary workhorse for its exceptional legibility and neutral, technical character. It is paired with **JetBrains Mono** for specialized labels and code snippets to reinforce the STEM identity.

- **Headlines:** Use tight tracking (-0.02em) on larger display sizes to maintain a compact, "designed" feel.
- **Body Text:** Standardize on `body-md` for most interface text to maximize information density without sacrificing readability.
- **Labels:** Technical metadata, IDs, and status tags use `label-md` (JetBrains Mono). This provides a distinct visual texture that separates "data" from "instructional text."
- **Scale:** All typography scales are based on a 4px baseline grid to ensure perfect vertical alignment across multi-column layouts.

## Layout & Spacing

The design system employs a **12-column fluid grid** for desktop and a **4-column grid** for mobile. 

- **The 8px Rhythm:** All spacing (padding, margins, gaps) must be a multiple of 8px (or 4px for tight micro-spacing).
- **Multi-Tenant Layout:** The primary navigation resides in a narrow left-hand rail (72px collapsed, 240px expanded). Content is housed in "Stage" containers with a max-width of 1440px to prevent line lengths from becoming unreadable on ultra-wide monitors.
- **Responsive Behavior:** 
    - **Desktop (1024px+):** Full sidebar, 24px gutters, 32px page margins.
    - **Tablet (768px - 1023px):** Icon-only sidebar, 16px gutters, 24px page margins.
    - **Mobile (<767px):** Bottom navigation or hamburger menu, 16px gutters, 16px page margins. Cards reflow to a single column stack.

## Elevation & Depth

To maintain a clean, professional aesthetic, this design system uses **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.

- **Level 0 (Background):** The base canvas color (`#1F2937`).
- **Level 1 (Cards/Surface):** A slightly lighter surface. These surfaces use a subtle 1px border (`#4B5563` at 20% opacity) instead of a shadow to define their edges.
- **Level 2 (Hover/Active):** When a user interacts with a module, apply a soft, ambient shadow (10% opacity, no tint) and increase the border prominence.
- **Modals/Overlays:** Use a high-diffusion shadow (24px blur, 15% opacity) and a backdrop blur (8px) to create a clear separation from the underlying data.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a professional, "engineered" feel that is more approachable than sharp 90-degree corners but more serious than highly rounded "consumer" apps.

- **Small Components (Buttons, Inputs, Chips):** 4px (0.25rem) radius.
- **Medium Components (Cards, Modals):** 8px (0.5rem) radius.
- **Large Components (Main Content Areas):** 12px (0.75rem) radius.
- **Selection Indicators:** Use vertical "pills" (full round) for active navigation states on the sidebar edge.

## Components

### Buttons
- **Primary:** Filled with `#0A5EB5`. Text is `#E8F0FE`. No icons unless essential.
- **Secondary:** Outlined with a 1px border of `#0A5EB5`.
- **Tertiary (Ghost):** No background or border. Used for low-priority actions.
- **Success Action:** Only use Emerald (#10B981) for "Submit Final Answer" or "Approve Submission."

### Input Fields
- Follow Material 3 "Outlined" style. 
- Label sits on the border stroke. 
- Active state uses a 2px stroke of the primary blue (#0A5EB5). 
- Error state uses a 2px stroke of Crimson.

### Cards
- The primary container for "Modules" or "Challenges."
- Padding should be 24px (`lg`).
- Header areas should be separated by a subtle horizontal rule.

### Chips & Tags
- Used for "Category" (STEM subjects) or "Status."
- Status tags for "In Progress" should use the Primary Blue.
- Status tags for "Completed" use Emerald background with dark text.

### Micro-interactions
- **Hover:** Surfaces should lighten by 5% on hover.
- **Active/Press:** Elements should scale down slightly (98%) to provide tactile feedback.
- **Progress Bars:** Use a smooth CSS transition (0.5s ease-in-out) when updating.