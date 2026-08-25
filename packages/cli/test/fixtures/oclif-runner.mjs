import { runCommand } from '@oclif/test';

const [packageRoot, document] = process.argv.slice(2);
const result = await runCommand(['lint', '--file', document, '--json'], { root: packageRoot });
process.stdout.write(
  JSON.stringify({
    exitCode: result.error?.oclif?.exit,
    stdout: result.stdout,
  }),
);
