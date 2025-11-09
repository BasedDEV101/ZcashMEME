import { runTxToolCommand, TxToolCommandError } from './tx-tool-command.js';

export { TxToolCommandError as BurnCommandError };

export function runBurn(payload, options = {}) {
  return runTxToolCommand({
    subcommand: 'burn',
    fileFlag: '--burn-file',
    payload,
    extraArgs: options.extraArgs || [],
  });
}


