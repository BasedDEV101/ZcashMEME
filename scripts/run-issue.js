import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class IssueCommandError extends Error {
  constructor(message, { code = 'ISSUE_COMMAND_FAILED', details } = {}) {
    super(message);
    this.name = 'IssueCommandError';
    this.code = code;
    this.details = details;
  }
}

function parseStatusError(stderr) {
  if (!stderr) {
    return null;
  }

  const lines = stderr
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const marker = 'Issue command failed:';
    const idx = line.indexOf(marker);
    if (idx !== -1) {
      const message = line.slice(idx + marker.length).trim();
      let code = 'ISSUE_COMMAND_STATUS';

      if (message.startsWith('validation failed')) {
        code = 'ISSUE_COMMAND_VALIDATION';
      } else if (message.startsWith('broadcast failed')) {
        code = 'ISSUE_COMMAND_BROADCAST';
      } else if (message.startsWith('mining failed')) {
        code = 'ISSUE_COMMAND_MINING';
      }

      return { message, code };
    }
  }

  return null;
}

/**
 * Spawn the Rust tx-tool issue command and return its JSON result.
 * @param {object} payload JSON payload matching the CLI schema.
 * @returns {Promise<object>} Parsed response from the CLI.
 */
export function runIssue(payload) {
  const filePath = join(tmpdir(), `issue-${Date.now()}.json`);
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
        'issue',
        '--asset-file',
        filePath
      ],
      {
        cwd: 'tx-tool',
        stdio: ['ignore', 'pipe', 'pipe']
      }
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
        new IssueCommandError('Failed to start `cargo` process', {
          code: 'ISSUE_COMMAND_SPAWN',
          details: { cause: err }
        })
      );
    });

    child.on('close', code => {
      try {
        unlinkSync(filePath);
      } catch (_) {
        // ignore cleanup errors
      }

      if (code !== 0) {
        const parsed = parseStatusError(stderr);
        if (parsed) {
          return reject(
            new IssueCommandError(parsed.message, {
              code: parsed.code,
              details: { exitCode: code, stderr: stderr.trim() || undefined }
            })
          );
        }

        return reject(
          new IssueCommandError(`issue command failed (code ${code})`, {
            code: 'ISSUE_COMMAND_FAILED',
            details: { exitCode: code, stderr: stderr.trim() || undefined }
          })
        );
      }

      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) {
        return reject(
          new IssueCommandError(
            `issue command did not return JSON. Output: ${stdout.trim()}`,
            {
              code: 'ISSUE_COMMAND_NO_JSON',
              details: { stdout: stdout.trim() }
            }
          )
        );
      }

      const jsonString = stdout.slice(jsonStart).trim();

      try {
        const result = JSON.parse(jsonString);
        resolve(result);
      } catch (parseErr) {
        reject(
          new IssueCommandError(
            `failed to parse issue command output as JSON: ${parseErr.message}`,
            {
              code: 'ISSUE_COMMAND_PARSE',
              details: { stdout: stdout.trim() }
            }
          )
        );
      }
    });
  });
}

