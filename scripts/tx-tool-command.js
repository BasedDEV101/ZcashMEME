import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class TxToolCommandError extends Error {
  constructor(message, { code = 'TX_TOOL_COMMAND_FAILED', details } = {}) {
    super(message);
    this.name = 'TxToolCommandError';
    this.code = code;
    this.details = details;
  }
}

function parseStatusError(stderr, subcommand) {
  if (!stderr) {
    return null;
  }

  const searchPrefix = `${capitalize(subcommand)} command failed:`;
  const lines = stderr
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const idx = line.indexOf(searchPrefix);
    if (idx !== -1) {
      const message = line.slice(idx + searchPrefix.length).trim();
      let code = 'TX_TOOL_COMMAND_STATUS';

      if (message.startsWith('validation failed')) {
        code = 'TX_TOOL_COMMAND_VALIDATION';
      } else if (message.startsWith('broadcast failed')) {
        code = 'TX_TOOL_COMMAND_BROADCAST';
      } else if (message.startsWith('mining failed')) {
        code = 'TX_TOOL_COMMAND_MINING';
      }

      return { message, code };
    }
  }

  return null;
}

function capitalize(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function runTxToolCommand({
  subcommand,
  fileFlag,
  payload,
  extraArgs = [],
}) {
  if (!subcommand) {
    return Promise.reject(
      new TxToolCommandError('Missing required subcommand name', {
        code: 'TX_TOOL_COMMAND_INVALID_INPUT',
      }),
    );
  }

  if (!fileFlag) {
    return Promise.reject(
      new TxToolCommandError('Missing required file flag for temporary payload', {
        code: 'TX_TOOL_COMMAND_INVALID_INPUT',
      }),
    );
  }

  const filePath = join(tmpdir(), `${subcommand}-${Date.now()}.json`);
  writeFileSync(filePath, JSON.stringify(payload));

  return new Promise((resolve, reject) => {
    const child = spawn(
      'cargo',
      [
        'run',
        '--release',
        '--package',
        'zcash_tx_tool',
        '--bin',
        'zcash_tx_tool',
        subcommand,
        fileFlag,
        filePath,
        ...extraArgs,
      ],
      {
        cwd: 'tx-tool',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      const data = chunk.toString();
      stderr += data;
      console.error(data);
    });

    child.on('error', err => {
      try {
        unlinkSync(filePath);
      } catch (_) {
        // ignore cleanup errors
      }
      reject(
        new TxToolCommandError('Failed to start `cargo` process', {
          code: 'TX_TOOL_COMMAND_SPAWN',
          details: { cause: err },
        }),
      );
    });

    child.on('close', code => {
      try {
        unlinkSync(filePath);
      } catch (_) {
        // ignore cleanup errors
      }

      if (code !== 0) {
        const parsed = parseStatusError(stderr, subcommand);
        if (parsed) {
          return reject(
            new TxToolCommandError(parsed.message, {
              code: parsed.code,
              details: {
                exitCode: code,
                stderr: stderr.trim() || undefined,
              },
            }),
          );
        }

        return reject(
          new TxToolCommandError(`${subcommand} command failed (code ${code})`, {
            details: {
              exitCode: code,
              stderr: stderr.trim() || undefined,
            },
          }),
        );
      }

      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) {
        return reject(
          new TxToolCommandError(
            `${subcommand} command did not return JSON. Output: ${stdout.trim()}`,
            {
              code: 'TX_TOOL_COMMAND_NO_JSON',
              details: { stdout: stdout.trim() },
            },
          ),
        );
      }

      const jsonString = stdout.slice(jsonStart).trim();

      try {
        const result = JSON.parse(jsonString);
        resolve(result);
      } catch (parseErr) {
        reject(
          new TxToolCommandError(
            `failed to parse ${subcommand} command output as JSON: ${parseErr.message}`,
            {
              code: 'TX_TOOL_COMMAND_PARSE',
              details: { stdout: stdout.trim() },
            },
          ),
        );
      }
    });
  });
}


