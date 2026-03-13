const { runCommand, escapeShellArg } = require('../utils/exec');

function makeTempFilePath() {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `/tmp/codex-last-${stamp}-${random}.txt`;
}

function normalizeModel(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeReasoning(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function stripAnsi(value) {
  return String(value).replace(
    /[\u001b\u009b][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-ORZcf-ntqry=><])/g,
    '',
  );
}

function extractProgressLines(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return [];
  }

  const output = [];
  const seen = new Set();
  const lines = raw.replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    const cleaned = stripAnsi(line).trim();
    if (!cleaned) {
      continue;
    }

    if (seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    output.push(cleaned.slice(0, 220));

    if (output.length >= 40) {
      break;
    }
  }

  return output;
}

function extractProgressPercent(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  const cleaned = stripAnsi(raw);
  const percentMatches = [...cleaned.matchAll(/\b(100|[1-9]?\d)\s*%/g)];
  if (percentMatches.length === 0) {
    return null;
  }

  const lastMatch = percentMatches[percentMatches.length - 1];
  const value = Number.parseInt(lastMatch[1], 10);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return null;
  }

  return value;
}

async function ask(prompt, options = {}) {
  const outputFile = makeTempFilePath();
  const escapedOutputFile = escapeShellArg(outputFile);
  const escapedPrompt = escapeShellArg(prompt);
  const model = normalizeModel(options.model);
  const reasoning = normalizeReasoning(options.reasoning);
  const cliArgs = [
    'codex exec --color never --skip-git-repo-check',
    `--output-last-message ${escapedOutputFile}`,
  ];

  if (model) {
    cliArgs.push(`--model ${escapeShellArg(model)}`);
  }

  if (reasoning) {
    cliArgs.push(`-c ${escapeShellArg(`model_reasoning_effort="${reasoning}"`)}`);
  }

  // `codex exec` is non-interactive and safe to call from HTTP requests.
  const command = [
    `${cliArgs.join(' ')} ${escapedPrompt} >/dev/null`,
    'RC=$?',
    `if [ -f ${escapedOutputFile} ]; then cat ${escapedOutputFile}; rm -f ${escapedOutputFile}; fi`,
    'exit $RC',
  ].join('; ');

  let stderrSnapshot = '';
  let latestProgressPercent = null;
  const result = await runCommand(command, {
    ...options,
    captureStderr: true,
    onStderrChunk(chunk) {
      stderrSnapshot += chunk;
      const lines = extractProgressLines(stderrSnapshot);
      const percent = extractProgressPercent(stderrSnapshot);
      if (Number.isFinite(percent)) {
        latestProgressPercent = percent;
      }
      if (typeof options.onProgress === 'function') {
        options.onProgress({
          lines,
          percent: Number.isFinite(percent) ? percent : latestProgressPercent,
        });
      }
    },
  });
  if (typeof result === 'string') {
    return {
      text: result,
      progress: [],
      progressPercent: latestProgressPercent,
    };
  }

  return {
    text: result.stdout || '',
    progress: extractProgressLines(result.stderr || ''),
    progressPercent: extractProgressPercent(result.stderr || '') ?? latestProgressPercent,
  };
}

module.exports = { ask };
