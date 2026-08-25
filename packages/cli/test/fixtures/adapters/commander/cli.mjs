import { Command } from 'commander';

export function createClistdProgram() {
  const program = new Command();
  program.name('fixture').description('A minimal Commander fixture CLI.');
  program
    .command('greet')
    .description('Print a greeting.')
    .option('--json', 'Produce JSON output.');
  return program;
}
