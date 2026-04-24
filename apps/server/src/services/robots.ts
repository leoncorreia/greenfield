/**
 * Minimal robots.txt respect: if robots disallows path, skip fetch.
 * Not a full RFC-compliant parser — hackathon-safe default-deny on parse errors for *user-agent: *.
 */

function parseDisallowPaths(robotsTxt: string): string[] {
  const paths: string[] = [];
  let appliesToAll = false;
  for (const line of robotsTxt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^user-agent:\s*\*/i.test(trimmed)) {
      appliesToAll = true;
      continue;
    }
    if (/^user-agent:/i.test(trimmed)) {
      appliesToAll = false;
      continue;
    }
    if (appliesToAll && /^disallow:\s*/i.test(trimmed)) {
      const p = trimmed.replace(/^disallow:\s*/i, "").trim();
      if (p) paths.push(p);
    }
  }
  return paths;
}

function isPathDisallowed(pathname: string, disallowPrefixes: string[]): boolean {
  for (const prefix of disallowPrefixes) {
    if (prefix === "/") return true;
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export async function isUrlAllowedByRobots(url: string, signal?: AbortSignal): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const robotsUrl = `${u.origin}/robots.txt`;
  let text: string;
  try {
    const res = await fetch(robotsUrl, { signal, redirect: "follow" });
    if (!res.ok) return true;
    text = await res.text();
  } catch {
    return true;
  }
  const disallows = parseDisallowPaths(text);
  return !isPathDisallowed(u.pathname || "/", disallows);
}
