import { TokenCreator } from '../src/token-creator.js';

async function main() {
  const args = process.argv.slice(2);
  let mine = false;
  const positional = [];

  for (const arg of args) {
    if (arg === '--mine') {
      mine = true;
      continue;
    }
    positional.push(arg);
  }

  const assetId = positional[0];
  if (!assetId) {
    console.error('Usage: node scripts/deploy-token.js <assetId> [--mine]');
    process.exit(1);
  }

  const creator = new TokenCreator();
  try {
    console.log(`Deploying token ${assetId} ${mine ? '(with mining)' : ''}...`);
    const result = await creator.deployToken(assetId, { mine });
    console.log('Deployment success:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Deployment failed:');
    console.error(error);
    if (mine === false && error?.message?.includes('consensus validation')) {
      console.error(
        '\nHint: try rerunning with `--mine` against a local Zebra regtest node, ' +
          'or verify the remote node accepts ZSA issuance.'
      );
    }
    process.exit(1);
  }
}

main();
