# Dependency remediation

Verified against npm's registry and audit on 2026-10-08.

- Next.js and eslint-config-next are matched at 15.5.27. This is the minimum
  15.5 patch clearing the Next.js advisories returned by this audit. Next 15
  remains Maintenance LTS per https://nextjs.org/support-policy.
- Next 15.5.27 still pins PostCSS 8.4.31. The narrow `next > postcss` override
  selects 8.5.29 within PostCSS major 8 to clear its source-map file disclosure
  and CSS-stringification advisories without upgrading to Next 16. Reassess this
  override on the next framework update; remove it when the upstream dependency
  is patched. Verify the production build when changing it.
- csv-parse is 7.0.3 to fix GHSA-8cw4-87c7-c6xx (columns prototype replacement).
  There is no patched 6.x in the audit. The upstream 7.0.0 changelog says its
  major bump was accidental and introduced no breaking changes:
  https://github.com/adaltas/node-csv/blob/master/packages/csv-parse/CHANGELOG.md
  Tests preserve the entire checked-in dataset's parsed contents and reproduce
  the prototype-replacement defect against the old parser. The attack test uses
  a cast callback to exercise the dependency defect; the application does not
  currently supply such a callback.
- Compatible transitive lockfile updates clear the remaining fixable findings;
  no new direct dependency, React major upgrade, or auth change is introduced.

## Residual development-only advisory

The full audit still reports five high-severity package entries from a single
unpatched chain: eslint-config-next -> @next/eslint-plugin-next -> fast-glob ->
micromatch -> braces 3.0.3. GHSA-vfj7-8cjw-p6xm concerns stack exhaustion with
 deeply nested brace patterns (https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The latest published braces is 3.0.3 in the checked registry. npm suggests a
framework lint-config downgrade to 14.2.35, which would mismatch Next 15 and is
not applied. These packages are development tooling, not production runtime
imports; lint/build inputs must remain trusted. This is a residual risk, not a
claim that all advisories are resolved. Track a patched braces/upstream release.

`npm audit --omit=dev` reports zero vulnerabilities for the installed production
lockfile. Audit success does not assess application authentication, model costs,
provider availability, environment overrides, or deployment health.

Verify with `npm ci`, `npm test`, `npm run lint`, `npx tsc --noEmit`,
`npm run build`, and both full and production-only `npm audit`.
