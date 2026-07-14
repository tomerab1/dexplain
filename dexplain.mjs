#!/usr/bin/env node
import { main } from './lib/cli.mjs';

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`dexplain: unexpected error: ${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
