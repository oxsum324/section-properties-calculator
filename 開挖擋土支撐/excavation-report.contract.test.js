const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const toolRoot = __dirname;
const releaseEvidenceDir = process.env.EXCAVATION_RENDERED_EVIDENCE_DIR
  ? path.resolve(process.env.EXCAVATION_RENDERED_EVIDENCE_DIR)
  : process.env.PREFLIGHT_RELEASE === '1' && process.env.PREFLIGHT_RUN_DIR
    ? path.join(path.resolve(process.env.PREFLIGHT_RUN_DIR), 'rendered-delivery-evidence', 'excavation-formal')
    : '';

const result = spawnSync(
  'python',
  ['-m', 'unittest', 'backend.tests.test_reporting'],
  {
    cwd: toolRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  }
);

if (result.error) {
  console.error(`FAIL | excavation report contract spawn error :: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`FAIL | excavation report contract :: exit=${result.status ?? 'null'}`);
  process.exit(result.status || 1);
}

if (releaseEvidenceDir) {
  fs.mkdirSync(releaseEvidenceDir, { recursive: true });
  const artifactResult = spawnSync(
    'python',
    ['-m', 'backend.tests.release_report_artifacts', releaseEvidenceDir],
    {
      cwd: toolRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    }
  );
  if (artifactResult.error) {
    console.error(`FAIL | excavation release artifact spawn error :: ${artifactResult.error.message}`);
    process.exit(1);
  }
  if (artifactResult.status !== 0) {
    console.error(`FAIL | excavation release artifacts :: exit=${artifactResult.status ?? 'null'}`);
    process.exit(artifactResult.status || 1);
  }
}

console.log('\nExcavation report contract checks passed.');
