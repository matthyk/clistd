import { Command, Flags } from '@oclif/core';

export default class Greet extends Command {
  static description = 'Print a greeting.';

  static flags = {
    json: Flags.boolean({ description: 'Produce JSON output.' }),
  };

  async run() {}
}
