import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      reject(err);
    });

    child.on('close', code => {
      try {
        unlinkSync(filePath);
      } catch (_) {
        // ignore cleanup errors
      }

      if (code !== 0) {
        return reject(
          new Error(
            `issue command failed (code ${code})${
              stderr ? `: ${stderr.trim()}` : ''
            }`
          )
        );
      }

      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) {
        return reject(
          new Error(
            `issue command did not return JSON. Output: ${stdout.trim()}`
          )
        );
      }

      const jsonString = stdout.slice(jsonStart).trim();

      try {
        const result = JSON.parse(jsonString);
        resolve(result);
      } catch (parseErr) {
        reject(
          new Error(
            `failed to parse issue command output as JSON: ${parseErr.message}`
          )
        );
      }
    });
  });
}

