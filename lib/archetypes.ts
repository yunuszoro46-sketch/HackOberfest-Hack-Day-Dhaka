// Visual archetypes ("aesthetic DNA") for the user's app. Chosen in the Preview stage; passed into the preview
// prompt and the compiled build prompt. These describe the app being planned, not TeamMate's own UI.
export interface VisualArchetype {
  id: string;
  name: string;
  tagline: string;
  bestFor: string;
  palette: { name: string; hex: string }[];
  typography: { display: string; body: string; data: string };
  principles: string[];
  sampleCssVars: string;
}

export const ARCHETYPES: VisualArchetype[] = [
  {
    id: "hardware-lcd",
    name: "Hardware Console / Retro LCD",
    tagline: "Physical instrument panel, amber seven-segment displays, and scanline depth.",
    bestFor: "DevOps, SRE dispatch, terminal consoles, IoT monitoring, security ops.",
    palette: [
      { name: "Glass", hex: "#101010" },
      { name: "Amber Glow", hex: "#FFA319" },
      { name: "Bone White", hex: "#E8E2D4" },
      { name: "Alert Red", hex: "#FF4D3D" },
    ],
    typography: {
      display: "Chakra Petch / 16-Segment",
      body: "IBM Plex Sans",
      data: "JetBrains Mono (Tabular)",
    },
    principles: [
      "Glow and scanlines applied only to hero telemetry display",
      "Unlit segments visible in faint ghost amber",
      "Never convey status by color alone",
    ],
    sampleCssVars: "--glass: #101010; --brand: #FFA319; --text: #E8E2D4;",
  },
  {
    id: "bento-grid",
    name: "Precision Bento Grid",
    tagline: "Clean hairline dividers, modular proportional cards, and strict 60-30-10 color balance.",
    bestFor: "SaaS dashboards, metrics aggregators, productivity planners, executive overview.",
    palette: [
      { name: "Slate Canvas", hex: "#0B0F17" },
      { name: "Surface", hex: "#141C2B" },
      { name: "Indigo Accent", hex: "#6366F1" },
      { name: "Pure Chalk", hex: "#F8FAFC" },
    ],
    typography: {
      display: "Plus Jakarta Sans",
      body: "Inter / Manrope",
      data: "IBM Plex Mono",
    },
    principles: [
      "Zero-pill metadata discipline with subtle dot separators",
      "Single-elevation depth (no cards within cards)",
      "High-density tabular numerals",
    ],
    sampleCssVars: "--canvas: #0B0F17; --surface: #141C2B; --accent: #6366F1;",
  },
  {
    id: "minimalist-mono",
    name: "Minimalist Technical Monospace",
    tagline: "Pure Markdown clarity, deliberate whitespace, border accents, and zero fluff.",
    bestFor: "Developer CLI helpers, API consoles, code notebooks, scientific calculators.",
    palette: [
      { name: "Terminal Void", hex: "#0D1117" },
      { name: "Code Surface", hex: "#161B22" },
      { name: "Teal Mint", hex: "#5FD0C4" },
      { name: "Muted Ink", hex: "#94A3B8" },
    ],
    typography: {
      display: "Space Mono",
      body: "JetBrains Mono",
      data: "JetBrains Mono (Tabular)",
    },
    principles: [
      "Text measure constrained to 65-75 characters",
      "Fast keyboard navigation and shortcut tooltips",
      "No unsolicited animations or background videos",
    ],
    sampleCssVars: "--bg: #0D1117; --line: #30363D; --mint: #5FD0C4;",
  },
  {
    id: "humanist-editorial",
    name: "Warm Humanist Editorial",
    tagline: "Refined serif headlines, calm bone surfaces, and bookish legibility for long sessions.",
    bestFor: "Research papers, AI study companions, clinical reference, literature analysis.",
    palette: [
      { name: "Deep Espresso", hex: "#141210" },
      { name: "Parchment", hex: "#EBE5D8" },
      { name: "Terracotta", hex: "#D97746" },
      { name: "Muted Taupe", hex: "#9C9588" },
    ],
    typography: {
      display: "Fraunces / Playfair Display",
      body: "Public Sans",
      data: "Space Mono",
    },
    principles: [
      "Generous line-height (1.6) and comfortable margins",
      "Balanced headlines with text-wrap: balance",
      "Clear hierarchy between claim and evidence",
    ],
    sampleCssVars: "--parchment: #EBE5D8; --espresso: #141210; --terracotta: #D97746;",
  },
];


export const archetypeById = (id: string | null | undefined) => ARCHETYPES.find((a) => a.id === id) ?? null;

/** The hardware-console look only suits ops-style domains; otherwise no archetype is preselected. */
export function suggestedArchetype(text: string): string | null {
  return /\b(devops|sre|on-?call|incident|monitor\w*|telemetry|iot|terminal|console|dispatch|security ops|ops)\b/i.test(text) ? "hardware-lcd" : null;
}
