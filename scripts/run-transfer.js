import { runTxToolCommand, TxToolCommandError } from './tx-tool-command.js';

export { TxToolCommandError as TransferCommandError };

export function runTransfer(payload, options = {}) {
  return runTxToolCommand({
    subcommand: 'transfer',
    fileFlag: '--transfer-file',
    payload,
    extraArgs: options.extraArgs || [],
  });
}


