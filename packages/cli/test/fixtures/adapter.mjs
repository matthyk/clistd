let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  process.stdout.write(
    JSON.stringify({
      document: {
        $id: 'https://example.com/adapter-cli/0.1',
        specVersion: '0.1',
        cli: {
          name: request.source,
          description: 'An adapter fixture CLI.',
          commandSeparator: ':',
          endOfOptions: true,
        },
        commands: [
          {
            id: 'hello',
            invocation: ['hello'],
            description: 'Say hello.',
            flags: [
              {
                id: 'json',
                long: 'json',
                description: 'Produce JSON output.',
                kind: 'boolean',
                valueSchema: { type: 'boolean' },
              },
            ],
            exitCodes: [{ id: 'success', code: 0, description: 'The command succeeded.' }],
          },
        ],
      },
      uri: 'urn:clistd:adapter-fixture',
    }),
  );
});
