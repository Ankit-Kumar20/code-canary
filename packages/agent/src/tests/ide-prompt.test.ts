import { describe, it, expect } from 'vitest';
import type { Package, Vulnerability } from '@dependency-canary/shared';

/* -------------------------------------------------------------------------- */
/*  Pure helper functions duplicated here for unit testing without DOM dep.   */
/*  These are the exact same implementations as in ide-solution-box.tsx.      */
/* -------------------------------------------------------------------------- */

function extractSafeVersion(vuln?: Partial<Vulnerability>): string {
  if (!vuln || !vuln.affectedRanges || vuln.affectedRanges.length === 0) return 'latest';
  for (const range of vuln.affectedRanges) {
    const match = range.match(/(?:<|<=)\s*v?([0-9]+(?:\.[0-9]+)+(?:-[a-zA-Z0-9.]+)?)/);
    if (match?.[1]) return match[1];
  }
  return 'latest';
}

function getManifestFilename(eco: string): string {
  switch (eco.toLowerCase()) {
    case 'npm': case 'node': case 'javascript': case 'typescript': return 'package.json';
    case 'pypi': case 'python': return 'requirements.txt / pyproject.toml';
    case 'cargo': case 'rust': return 'Cargo.toml';
    case 'go': case 'golang': case 'gomod': return 'go.mod';
    default: return 'dependency manifest file';
  }
}

function getUpgradeCommand(eco: string, pkgName: string, safeVersion: string): string {
  const versionSpec = safeVersion === 'latest' ? 'latest' : `^${safeVersion}`;
  switch (eco.toLowerCase()) {
    case 'npm': case 'node': return `npm install ${pkgName}@${versionSpec}`;
    case 'pypi': case 'python':
      return safeVersion === 'latest'
        ? `pip install --upgrade ${pkgName}`
        : `pip install --upgrade "${pkgName}>=${safeVersion}"`;
    case 'cargo': case 'rust': return `cargo update -p ${pkgName}`;
    case 'go': case 'golang': case 'gomod':
      return safeVersion === 'latest' ? `go get ${pkgName}@latest` : `go get ${pkgName}@v${safeVersion}`;
    default: return `Update ${pkgName} to version ${safeVersion}`;
  }
}

function buildSingleFixPrompt(projectId: string, pkg: Package, vuln: Vulnerability): string {
  const safeVersion = extractSafeVersion(vuln);
  const manifest = getManifestFilename(pkg.eco);
  const cmd = getUpgradeCommand(pkg.eco, pkg.name, safeVersion);
  const depType = pkg.direct ? 'Direct manifest requirement' : 'Transitive dependency';
  const ecoLabel = pkg.eco.toUpperCase();
  return `Fix the following security vulnerability in ${projectId}:

- Target Package: ${pkg.name}@${pkg.version} (${ecoLabel})
- Dependency Type: ${depType}
- Advisory / CVE: ${vuln.id} (${vuln.severity} severity, CVSS ${vuln.cvss.toFixed(1)})
- Root Cause / Summary: ${vuln.summary}
- Affected Versions: ${vuln.affectedRanges.join(', ')}
- Target Manifest: ${manifest}
- Safe Target Version: >= ${safeVersion}
- Recommended Upgrade Command: \`${cmd}\`

Instructions for IDE / AI Assistant:
1. Locate "${pkg.name}" in ${manifest} (or add an override/resolution for transitive packages).
2. Update the version constraint to safe version >= ${safeVersion}.
3. Run \`${cmd}\` to sync lockfiles.
4. Review codebase for any deprecated API usage or breaking changes.
5. Run test suite to verify the fix works cleanly without breaking functionality.`;
}

function buildMultiFixPrompt(
  projectId: string,
  targets: Array<{ pkg: Package; vuln: Vulnerability }>,
): string {
  const lines = targets.map(({ pkg, vuln }) => {
    const safeVersion = extractSafeVersion(vuln);
    const manifest = getManifestFilename(pkg.eco);
    const cmd = getUpgradeCommand(pkg.eco, pkg.name, safeVersion);
    return `• [${vuln.severity}] ${pkg.name}@${pkg.version} (${vuln.id}, CVSS ${vuln.cvss.toFixed(1)})
  Summary: ${vuln.summary}
  Action: Upgrade to >= ${safeVersion} in ${manifest}
  Command: ${cmd}`;
  });
  return `Fix the following security vulnerabilities for ${projectId}:\n\n${lines.join('\n\n')}\n\nInstructions for IDE / AI Assistant:\n1. Update each flagged dependency to its recommended safe version in the respective manifest file.\n2. Run the specified upgrade commands to regenerate lockfiles.\n3. Check for any breaking changes across affected components.\n4. Verify tests pass and commit the security patches.`;
}

/* -------------------------------------------------------------------------- */
/*                             Test Fixtures                                   */
/* -------------------------------------------------------------------------- */
const makeVuln = (overrides: Partial<Vulnerability> = {}): Vulnerability => ({
  id: 'CVE-2024-45590', source: 'NVD', cvss: 9.8, severity: 'CRITICAL',
  published: '2024-09-10',
  summary: 'Denial of Service in body-parser via malformed Content-Encoding',
  affectedRanges: ['<1.20.3'], exploits: [], advisories: [],
  ...overrides,
});

const makePkg = (overrides: Partial<Package> = {}): Package => ({
  name: 'body-parser', version: '1.20.2', eco: 'npm', direct: true,
  serviceRefs: ['api'], license: 'MIT', vulns: [], requires: [], requiredBy: [],
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/*                              Test Suite                                      */
/* -------------------------------------------------------------------------- */
describe('IDE Fix Prompt Generator', () => {
  it('correctly parses version boundaries and creates npm upgrade prompt', () => {
    const vuln = makeVuln();
    const pkg = makePkg({ vulns: [vuln] });

    expect(extractSafeVersion(vuln)).toBe('1.20.3');
    expect(getManifestFilename('npm')).toBe('package.json');
    expect(getUpgradeCommand('npm', 'body-parser', '1.20.3')).toBe('npm install body-parser@^1.20.3');

    const prompt = buildSingleFixPrompt('expressjs/express', pkg, vuln);
    expect(prompt).toContain('CVE-2024-45590');
    expect(prompt).toContain('body-parser@1.20.2');
    expect(prompt).toContain('>= 1.20.3');
    expect(prompt).toContain('npm install body-parser@^1.20.3');
    expect(prompt).toContain('package.json');
    expect(prompt).toContain('CRITICAL');
    expect(prompt).toContain('9.8');
  });

  it('correctly formats Python (PyPI) prompts', () => {
    const vuln = makeVuln({
      id: 'CVE-2023-32681', cvss: 6.1, severity: 'MEDIUM',
      summary: 'Requests leaks Proxy-Authorization header to destination server.',
      affectedRanges: ['<2.31.0'],
    });
    const pkg = makePkg({ name: 'requests', version: '2.28.1', eco: 'pypi', vulns: [vuln] });

    expect(extractSafeVersion(vuln)).toBe('2.31.0');
    expect(getManifestFilename('pypi')).toBe('requirements.txt / pyproject.toml');
    expect(getUpgradeCommand('pypi', 'requests', '2.31.0')).toBe('pip install --upgrade "requests>=2.31.0"');

    const prompt = buildSingleFixPrompt('fastapi/fastapi', pkg, vuln);
    expect(prompt).toContain('requirements.txt / pyproject.toml');
    expect(prompt).toContain('pip install --upgrade "requests>=2.31.0"');
    expect(prompt).toContain('CVE-2023-32681');
  });

  it('generates multi-vulnerability fix prompt for multiple packages', () => {
    const vuln1 = makeVuln();
    const pkg1 = makePkg({ vulns: [vuln1] });
    const vuln2 = makeVuln({
      id: 'CVE-2024-43796', cvss: 7.5, severity: 'HIGH',
      summary: 'Passing directory traversal path in send',
      affectedRanges: ['<0.19.0'],
    });
    const pkg2 = makePkg({ name: 'send', version: '0.18.0', eco: 'npm', direct: false, vulns: [vuln2] });

    const prompt = buildMultiFixPrompt('my-project', [
      { pkg: pkg1, vuln: vuln1 },
      { pkg: pkg2, vuln: vuln2 },
    ]);

    expect(prompt).toContain('CVE-2024-45590');
    expect(prompt).toContain('CVE-2024-43796');
    expect(prompt).toContain('body-parser@1.20.2');
    expect(prompt).toContain('send@0.18.0');
    expect(prompt).toContain('>= 1.20.3');
    expect(prompt).toContain('>= 0.19.0');
    expect(prompt).toContain('npm install body-parser@^1.20.3');
    expect(prompt).toContain('npm install send@^0.19.0');
    expect(prompt).toContain('Instructions for IDE');
  });
});
