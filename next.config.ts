import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ✅ In Next 15, this lives at the top level (not under "experimental")
  outputFileTracingIncludes: {
    // Include our CSV in the server bundle so API routes can read it on Vercel
    '/app/api/**': ['./data/companies.csv'],
  },

  // ✅ Force Turbopack to treat THIS folder as the project root (not your user profile)
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
