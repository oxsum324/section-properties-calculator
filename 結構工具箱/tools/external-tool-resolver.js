'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const TOOL_CONFIGS = Object.freeze({
  pdftotext: Object.freeze({ envVar: 'PDFTOTEXT_PATH', versionArgs: ['-v'] }),
  pdfinfo: Object.freeze({ envVar: 'PDFINFO_PATH', versionArgs: ['-v'], preferPopplerSibling: true }),
  pdftoppm: Object.freeze({ envVar: 'PDFTOPPM_PATH', versionArgs: ['-v'], preferPopplerSibling: true }),
  tar: Object.freeze({ envVar: 'TAR_PATH', versionArgs: ['--version'], preferWindowsSystem32: true }),
});

class ExternalToolResolutionError extends Error {
  constructor(tool, message, diagnostics = {}) {
    super(message);
    this.name = 'ExternalToolResolutionError';
    this.code = 'EXTERNAL_TOOL_UNAVAILABLE';
    this.tool = tool;
    this.diagnostics = diagnostics;
  }
}

function cleanPathValue(value) {
  const text = String(value || '').trim();
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"')
    ? text.slice(1, -1)
    : text;
}

function executableNames(tool, platform, env = process.env) {
  if (platform !== 'win32') return [tool];
  if (path.extname(tool)) return [tool];
  const extensions = String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map(extension => extension.trim().toLowerCase())
    .filter(Boolean);
  const preferred = ['.exe', ...extensions.filter(extension => extension !== '.exe')];
  return [...new Set(preferred)].map(extension => `${tool}${extension}`);
}

function isRegularFile(candidate, fsImpl = fs) {
  try {
    return fsImpl.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isDirectory(candidate, fsImpl = fs) {
  try {
    return fsImpl.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function canonicalPath(candidate, fsImpl = fs) {
  try {
    const realpath = fsImpl.realpathSync?.native || fsImpl.realpathSync;
    return realpath ? realpath.call(fsImpl.realpathSync, candidate) : path.resolve(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function candidatePathsFromValue(value, tool, options = {}) {
  const fsImpl = options.fs || fs;
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const cleaned = cleanPathValue(value);
  if (!cleaned) return [];
  const hasPathSyntax = path.isAbsolute(cleaned) || /[\\/]/.test(cleaned);
  const base = hasPathSyntax ? path.resolve(cwd, cleaned) : cleaned;
  if (hasPathSyntax && isDirectory(base, fsImpl)) {
    return executableNames(tool, platform, env).map(name => path.join(base, name));
  }
  if (hasPathSyntax) {
    if (platform === 'win32' && !path.extname(base)) {
      return executableNames(base, platform, env);
    }
    return [base];
  }
  return searchPathCandidates(cleaned, { ...options, fs: fsImpl, platform, env });
}

function searchPathCandidates(tool, options = {}) {
  const fsImpl = options.fs || fs;
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const delimiter = platform === 'win32' ? ';' : path.delimiter;
  const directories = String(env.PATH || '')
    .split(delimiter)
    .map(cleanPathValue)
    .filter(Boolean);
  const names = executableNames(tool, platform, env);
  const candidates = [];
  for (const directory of directories) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (isRegularFile(candidate, fsImpl)) candidates.push(candidate);
    }
  }
  return candidates;
}

function rejectedVersionReason(tool, version) {
  if (tool !== 'pdftotext') return '';
  const normalized = String(version || '').replace(/\s+/g, ' ').trim();
  if (/\b(?:xpdf|pdftotext)\s+version\s+4\.00(?:\D|$)/i.test(normalized)) {
    return 'Xpdf 4.00 is not accepted for calculation-book PDF extraction; use Poppler pdftotext.';
  }
  return '';
}

function probeCandidate(tool, candidate, source, options = {}) {
  const spawnSync = options.spawnSync || childProcess.spawnSync;
  const config = TOOL_CONFIGS[tool];
  const result = spawnSync(candidate, config.versionArgs, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  const stdout = String(result?.stdout || '');
  const stderr = String(result?.stderr || '');
  const version = `${stdout}\n${stderr}`.trim();
  if (result?.error) {
    return { tool, candidate, source, pass: false, reason: result.error.message || String(result.error), version };
  }
  const rejection = rejectedVersionReason(tool, version);
  if (rejection) return { tool, candidate, source, pass: false, reason: rejection, version };
  if (result?.status !== 0) {
    return { tool, candidate, source, pass: false, reason: `version probe exit=${result?.status}`, version };
  }
  return { tool, candidate, source, pass: true, reason: '', version };
}

function appendCandidate(entries, seen, candidate, source, options = {}) {
  const fsImpl = options.fs || fs;
  const platform = options.platform || process.platform;
  if (!candidate || !isRegularFile(candidate, fsImpl)) return;
  const resolvedPath = canonicalPath(candidate, fsImpl);
  const key = platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
  if (seen.has(key)) return;
  seen.add(key);
  entries.push({ candidate: resolvedPath, source });
}

function collectCandidates(tool, options = {}) {
  const config = TOOL_CONFIGS[tool];
  if (!config) throw new TypeError(`Unsupported external tool: ${tool}`);
  const fsImpl = options.fs || fs;
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const entries = [];
  const seen = new Set();
  const override = cleanPathValue(env[config.envVar]);
  if (override) {
    for (const candidate of candidatePathsFromValue(override, tool, { ...options, fs: fsImpl, platform, env })) {
      appendCandidate(entries, seen, candidate, `env:${config.envVar}`, { ...options, fs: fsImpl, platform });
    }
    return { entries, override, overrideVariable: config.envVar };
  }

  if (config.preferWindowsSystem32 && platform === 'win32') {
    const systemRoot = cleanPathValue(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows');
    for (const name of executableNames(tool, platform, env)) {
      appendCandidate(entries, seen, path.join(systemRoot, 'System32', name), 'windows-system32', { ...options, fs: fsImpl, platform });
    }
  }

  if (config.preferPopplerSibling) {
    try {
      const pdftotext = resolveExternalTool('pdftotext', { ...options, fs: fsImpl, platform, env });
      for (const name of executableNames(tool, platform, env)) {
        appendCandidate(entries, seen, path.join(path.dirname(pdftotext.command), name), 'poppler-sibling', { ...options, fs: fsImpl, platform });
      }
    } catch {
      // A standalone pdfinfo/pdftoppm installation can still be resolved from PATH.
    }
  }

  for (const candidate of searchPathCandidates(tool, { ...options, fs: fsImpl, platform, env })) {
    appendCandidate(entries, seen, candidate, 'PATH', { ...options, fs: fsImpl, platform });
  }
  return { entries, override: '', overrideVariable: config.envVar };
}

function resolveExternalTool(tool, options = {}) {
  const normalizedTool = String(tool || '').trim().toLowerCase();
  const config = TOOL_CONFIGS[normalizedTool];
  if (!config) throw new TypeError(`Unsupported external tool: ${tool}`);
  const candidates = collectCandidates(normalizedTool, options);
  const attempts = [];
  for (const entry of candidates.entries) {
    const attempt = probeCandidate(normalizedTool, entry.candidate, entry.source, options);
    attempts.push(attempt);
    if (attempt.pass) {
      return {
        tool: normalizedTool,
        command: entry.candidate,
        resolvedPath: entry.candidate,
        source: entry.source,
        version: attempt.version,
        versionLine: attempt.version.split(/\r?\n/).find(Boolean) || '',
        attempts,
      };
    }
  }

  const overrideDetail = candidates.override
    ? ` Explicit ${candidates.overrideVariable}=${candidates.override} did not resolve to an accepted executable.`
    : '';
  const attemptDetail = attempts.length
    ? ` Attempts: ${attempts.map(item => `${item.candidate} (${item.reason})`).join('; ')}`
    : ' No executable candidate was found.';
  throw new ExternalToolResolutionError(
    normalizedTool,
    `Unable to resolve ${normalizedTool}.${overrideDetail}${attemptDetail}`,
    { tool: normalizedTool, envVar: config.envVar, override: candidates.override, attempts },
  );
}

function diagnoseExternalTools(tools = Object.keys(TOOL_CONFIGS), options = {}) {
  const results = [];
  for (const tool of tools) {
    try {
      results.push({ pass: true, ...resolveExternalTool(tool, options) });
    } catch (error) {
      results.push({
        pass: false,
        tool,
        error: error.message,
        diagnostics: error.diagnostics || {},
      });
    }
  }
  return {
    platform: options.platform || process.platform,
    pass: results.every(result => result.pass),
    tools: results,
  };
}

function parseCliTools(argv) {
  const requested = argv.filter(value => !value.startsWith('-')).map(value => value.toLowerCase());
  return requested.length ? requested : ['pdftotext', 'pdfinfo', 'pdftoppm', 'tar'];
}

function main(argv = process.argv.slice(2)) {
  const diagnostics = diagnoseExternalTools(parseCliTools(argv));
  process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
  return diagnostics.pass ? 0 : 1;
}

module.exports = {
  TOOL_CONFIGS,
  ExternalToolResolutionError,
  cleanPathValue,
  executableNames,
  candidatePathsFromValue,
  searchPathCandidates,
  rejectedVersionReason,
  probeCandidate,
  collectCandidates,
  resolveExternalTool,
  diagnoseExternalTools,
  main,
};

if (require.main === module) process.exitCode = main();
