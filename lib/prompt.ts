// lib/prompt.ts
import type { Company } from './dataset';

/**
 * Build the analysis prompt for a company.
 * - Uses your CSV-backed context (industry, business models, powers, mechanisms)
 * - Leaves model choice & generation settings to lib/llm.ts
 */
export function makePrompt(
  c: Company,
  opts?: {
    /** For copy tweaks like "last N years" (default 5). */
    timeframeYears?: number;
    /** Include a short context preface from the dataset (default true). */
    includeContext?: boolean;
  }
) {
  const timeframeYears = Math.max(5, opts?.timeframeYears ?? 5);
  const includeContext = opts?.includeContext ?? true;

  // Context pulled from the CSV (used as priors—not as ground truth claims)
  const ctxLines: string[] = [];
  if (includeContext) {
    ctxLines.push(
      'CONTEXT (from dataset; use as priors, validate against public filings):',
      `• Company: ${c.name}${c.ticker ? `  |  Ticker: ${c.ticker}` : ''}`,
      `• Industry: ${c.industry || '—'}`,
      `• Tagged Business Models: ${c.businessModels.length ? c.businessModels.join(', ') : '—'}`,
      `• Tagged 7 Powers: ${c.powers.length ? c.powers.join(', ') : '—'}`,
      `• Tagged Mechanisms: ${c.mechanisms.length ? c.mechanisms.join(', ') : '—'}`,
      ''
    );
  }

  // Your full prompt, with {COMPANY} dynamically injected.
  // Kept verbatim (including punctuation and formatting) per your spec.
  const prompt = [
    'SYSTEM / ROLE',
    'You are a world‑class business‑school professor and strategy scholar.',
    'Write with the analytical rigor, empirical grounding, and pedagogical clarity expected in a top‑tier MBA classroom.',
    '',
    'OPERATING MODE',
    '1. Use numbered section headings that map **exactly** to the tasks below.',
    `2. Frame every insight as part of a **multi‑year trend (≥ ${timeframeYears} years)**—show directionality, inflection points, and persistence over time.`,
    '3. Cite data or sources whenever specific figures are mentioned (10‑K, investor deck, trade association, etc.).',
    '4. Where quantitative metrics are unavailable, state the proxy you used and why.',
    '',
    '---',
    ...ctxLines,
    `TASK #1 – Multi‑Year Business‑Model Diagnosis`,
    `Describe ${c.name}'s primary and secondary business models *over the last 5–10 years*, drawing from **each** concept in the list below.`,
    '- For every model that applies, briefly justify with one sentence plus a KPI (five‑year CAGR, attach rate, gross margin, etc.).',
    '- If none apply, say so and explain why.',
    '',
    'List of Business Models (verbatim, do not edit)',
    '1. **Auctions & Classifieds** – B2C and B2B auctions and classifieds platforms; e.g., Copart, Zillow, Manheim',
    '2. **B2B Middlemen** – One‑stop shops within a fragmented supply and customer base; e.g., Diploma, Watsco, Fastenal, Accenture',
    '3. **B2B Software** – SaaS and on‑premise software with a focus on vertical market offerings; e.g., Shopify, Atlassian, Salesforce, Datadog',
    "4. **Franchisors** – Firms that license trademarks to third‑party operators; e.g., Domino's Pizza, Marriott International, Wingstop",
    '5. **Low‑Cost Operators** – Lowest‑cost provider in the market; e.g., CarMax, Costco Wholesale, Wizz Air, Dollar General',
    '6. **Marketplaces & Platforms** – 2‑ or 3‑sided marketplaces that aim to achieve network effects; e.g., Spotify, DoorDash, Adyen, Booking Holdings, Uber',
    '7. **Mission‑Critical Products & Services** – Low‑cost/high‑benefit offerings with high switching costs; e.g., Danaher, Safran, Ecolab, IDEXX Laboratories',
    '8. **OEMs w/ Installed Base** – Manufacturers whose installed base drives recurring revenue; e.g., Rolls‑Royce, Danaher, Somero Enterprises',
    '9. **Physical Infrastructure & Networks** – Unique fixed assets or density networks; e.g., FTAI Aviation, Copart, Old Dominion Freight Line, InPost, GFL Environmental',
    '10. **Serial Acquirer** – Strategy centered on frequent accretive M&A; e.g., Brown & Brown, United Rentals, Berkshire Hathaway',
    '11. **Unique IP & Brands** – Trademark/copyright/patented IP or heritage brands; e.g., LVMH, Kering, Experian, Nintendo',
    '12. **Vertically Integrated Retailer** – Retailers that own supply, distribution, or delivery assets; e.g., Amazon, Naked Wines, SHEIN, Alimentation Couche‑Tard',
    '**Notes**',
    '1. Companies often blend models (e.g., Danaher = 7 + 8 + 10).',
    '2. State any hybrid or emergent pattern you observe and whether it has **strengthened or weakened** over the multi‑year period.',
    '3. Do not produce any output for those models which do not apply.',
    '',
    '---',
    'TASK #2 – Hamilton Helmer "7 Powers" Analysis *(Force‑Ranked, Top 3 Deep Dive)*',
    '',
    '**Step 1: Rank All Seven Powers**',
    `Evaluate ${c.name} against all seven powers and **force rank them from #1 (strongest) to #7 (weakest)**. Present this as a simple ranked list with one‑sentence justification for each ranking.`,
    '',
    '**Step 2: Deep Analysis of Top 3 Powers**',
    'For the **top three powers only**, provide comprehensive analysis using the template below:',
    '',
    ' [Power Name – Ranked #X]',
    ' - **Relevance Score** (0 – 5) – current strength for {COMPANY}',
    ' - **Key Mechanisms** – select from the reference list and add company‑specific colour',
    ' - **Measurable Determinants** – at least two metrics or proxies (latest available)',
    ' - **Trend Direction** – ↑ strengthening / ↓ weakening / → stable, plus one‑sentence rationale',
    ' - **Competitor Contrast** – 2–3 sentences comparing {COMPANY} to *[Competitor X]* on this power, citing at least one metric',
    '',
    '**The Seven Powers (for reference):**',
    '1. Scale Economies',
    '2. Network Economies',
    '3. Counter-Positioning',
    '4. Switching Costs',
    '5. Branding',
    '6. Cornered Resource',
    '7. Process Power',
    '',
    '*(Reference Mechanisms & Metrics list remains unchanged.)*',
    '',
    '---',
    `TASK #3 – Fly‑Wheel Narrative`,
    `Depict ${c.name}'s self‑reinforcing loop in **≤ 150 words** *or* a 4‑ to 5‑step diagram.`,
    '- Start with the initial trigger (e.g., scale manufacturing, unique data, brand trust).',
    '- Show how each turn lowers cost or raises willingness‑to‑pay, leading to the next turn.',
    '- End with the main defensibility hurdle a rival would face.',
    '',
    '(Optional Markdown diagram example)',
    'Input Volume ↑ → Unit Cost ↓ → Price/Service Edge ↑ → Market Share ↑ → More Volume ↑',
    '',
    '──────────────────────────────────',
    'OUTPUT STYLE',
    '• Title the output document "7 Powers and Flywheel Analysis"',
    '• Use concise paragraphs or tables; reserve prose flourishes for key insights.',
    '• Reference historical inflection points (regulation, tech shifts, M&A) where relevant.',
    '',
  ].join('\n');

  // Small substitution: replace {COMPANY} tokens inside the template
  // with the actual company name.
  return prompt.replaceAll('{COMPANY}', c.name);
}
