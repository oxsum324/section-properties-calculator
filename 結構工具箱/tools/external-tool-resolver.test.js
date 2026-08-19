'use strict';

const assert = require('assert');
const path = require('path');
const Resolver = require('./external-tool-resolver.js');

function fakeFs(files, directories = []) {
  const normalizedFiles = new Map(files.map(file => [path.win32.normalize(file).toLowerCase(), path.win32.normalize(file)]));
  const normalizedDirectories = new Set(directories.map(directory => path.win32.normalize(directory).toLowerCase()));
  const normalize = value => path.win32.normalize(value).toLowerCase();
  const realpathSync = value => normalizedFiles.get(normalize(value)) || path.win32.normalize(value);
  realpathSync.native = realpathSync;
  return {
    statSync(value) {
      const key = normalize(value);
      if (normalizedFiles.has(key)) return { isFile: () => true, isDirectory: () => false };
      if (normalizedDirectories.has(key)) return { isFile: () => false, isDirectory: () => true };
      const error = new Error(`ENOENT: ${value}`);
      error.code = 'ENOENT';
      throw error;
    },
    realpathSync,
  };
}

function fakeSpawn(versions) {
  return command => {
    const version = versions[path.win32.normalize(command).toLowerCase()];
    if (!version) return { status: null, stdout: '', stderr: '', error: new Error(`not executable: ${command}`) };
    return { status: 0, stdout: '', stderr: version };
  };
}

{
  const systemTar = 'C:\\Windows\\System32\\tar.exe';
  const pathTar = 'C:\\Git\\usr\\bin\\tar.exe';
  const options = {
    platform: 'win32',
    env: { SystemRoot: 'C:\\Windows', PATH: 'C:\\Git\\usr\\bin', PATHEXT: '.EXE;.CMD' },
    fs: fakeFs([systemTar, pathTar]),
    spawnSync: fakeSpawn({
      [systemTar.toLowerCase()]: 'bsdtar 3.8.4 - libarchive 3.8.4',
      [pathTar.toLowerCase()]: 'tar (GNU tar) 1.35',
    }),
  };
  const resolved = Resolver.resolveExternalTool('tar', options);
  assert.equal(resolved.resolvedPath, systemTar, 'Windows tar prefers the System32 executable');
  assert.equal(resolved.source, 'windows-system32', 'Windows tar reports its System32 source');
}

{
  const xpdf = 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe';
  const poppler = 'C:\\Poppler\\bin\\pdftotext.exe';
  const options = {
    platform: 'win32',
    env: { PATH: 'C:\\Program Files\\Git\\mingw64\\bin;C:\\Poppler\\bin', PATHEXT: '.EXE' },
    fs: fakeFs([xpdf, poppler]),
    spawnSync: fakeSpawn({
      [xpdf.toLowerCase()]: 'pdftotext version 4.00\nCopyright 1996-2019 Glyph & Cog, LLC',
      [poppler.toLowerCase()]: 'pdftotext version 25.07.0\nCopyright 2005-2025 The Poppler Developers',
    }),
  };
  const resolved = Resolver.resolveExternalTool('pdftotext', options);
  assert.equal(resolved.resolvedPath, poppler, 'resolver skips Xpdf 4.00 and selects Poppler later on PATH');
  assert.equal(resolved.attempts.length, 2, 'diagnostics preserve the rejected and accepted probes');
  assert.match(resolved.attempts[0].reason, /Xpdf 4\.00/, 'diagnostics explain the rejected Xpdf version');
}

{
  const override = 'D:\\Approved\\pdftotext.exe';
  const fallback = 'C:\\Poppler\\bin\\pdftotext.exe';
  const options = {
    platform: 'win32',
    env: { PDFTOTEXT_PATH: override, PATH: 'C:\\Poppler\\bin', PATHEXT: '.EXE' },
    fs: fakeFs([override, fallback]),
    spawnSync: fakeSpawn({ [override.toLowerCase()]: 'pdftotext version 25.07.0' }),
  };
  const resolved = Resolver.resolveExternalTool('pdftotext', options);
  assert.equal(resolved.resolvedPath, override, 'PDFTOTEXT_PATH is an authoritative explicit override');
  assert.equal(resolved.source, 'env:PDFTOTEXT_PATH', 'diagnostics identify the override variable');
}

{
  const rejected = 'D:\\Old\\pdftotext.exe';
  const fallback = 'C:\\Poppler\\bin\\pdftotext.exe';
  const options = {
    platform: 'win32',
    env: { PDFTOTEXT_PATH: rejected, PATH: 'C:\\Poppler\\bin', PATHEXT: '.EXE' },
    fs: fakeFs([rejected, fallback]),
    spawnSync: fakeSpawn({ [rejected.toLowerCase()]: 'pdftotext version 4.00' }),
  };
  assert.throws(
    () => Resolver.resolveExternalTool('pdftotext', options),
    error => error.code === 'EXTERNAL_TOOL_UNAVAILABLE'
      && /Explicit PDFTOTEXT_PATH/.test(error.message)
      && error.diagnostics.attempts.length === 1,
    'an invalid explicit override fails closed instead of silently using PATH',
  );
}

{
  const pdftotext = 'C:\\Poppler\\bin\\pdftotext.exe';
  const pdfinfo = 'C:\\Poppler\\bin\\pdfinfo.exe';
  const brokenWrapper = 'C:\\Broken\\pdfinfo.cmd';
  const options = {
    platform: 'win32',
    env: { PATH: 'C:\\Broken;C:\\Poppler\\bin', PATHEXT: '.CMD;.EXE' },
    fs: fakeFs([pdftotext, pdfinfo, brokenWrapper]),
    spawnSync: fakeSpawn({
      [pdftotext.toLowerCase()]: 'pdftotext version 25.07.0',
      [pdfinfo.toLowerCase()]: 'pdfinfo version 25.07.0',
    }),
  };
  const resolved = Resolver.resolveExternalTool('pdfinfo', options);
  assert.equal(resolved.resolvedPath, pdfinfo, 'pdfinfo is resolved beside the accepted Poppler pdftotext');
  assert.equal(resolved.source, 'poppler-sibling', 'diagnostics identify the same-suite Poppler resolution');
}

if (process.platform === 'win32') {
  const live = Resolver.diagnoseExternalTools(['pdftotext', 'pdfinfo', 'pdftoppm', 'tar']);
  assert.equal(live.pass, true, `live Windows toolchain resolves: ${JSON.stringify(live, null, 2)}`);
  const textTool = live.tools.find(tool => tool.tool === 'pdftotext');
  const infoTool = live.tools.find(tool => tool.tool === 'pdfinfo');
  const ppmTool = live.tools.find(tool => tool.tool === 'pdftoppm');
  const tarTool = live.tools.find(tool => tool.tool === 'tar');
  assert.doesNotMatch(textTool.version, /version\s+4\.00/i, 'live pdftotext is not Xpdf 4.00');
  assert.equal(path.dirname(infoTool.resolvedPath).toLowerCase(), path.dirname(textTool.resolvedPath).toLowerCase(), 'pdfinfo uses the accepted Poppler directory');
  assert.equal(path.dirname(ppmTool.resolvedPath).toLowerCase(), path.dirname(textTool.resolvedPath).toLowerCase(), 'pdftoppm uses the accepted Poppler directory');
  assert.equal(tarTool.source, 'windows-system32', 'live tar uses Windows System32');
}

console.log('external tool resolver OK');
