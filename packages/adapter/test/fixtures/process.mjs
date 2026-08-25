const mode = process.argv[2];

if (mode === 'timeout') {
  setInterval(() => undefined, 1_000);
} else if (mode === 'stdout-limit') {
  process.stdout.write('x'.repeat(256));
} else if (mode === 'stderr') {
  process.stderr.write('fixture process failure');
  process.exitCode = 3;
} else if (mode === 'cwd') {
  process.stdout.write(JSON.stringify({ document: { cwd: process.cwd() } }));
} else {
  let request = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    request += chunk;
  });
  process.stdin.on('end', () => {
    const parsed = JSON.parse(request);
    process.stdout.write(
      JSON.stringify({
        document: { source: parsed.source },
        diagnostics: [{ code: 'fixture/warning', message: 'Fixture warning.', severity: 'warn' }],
      }),
    );
  });
}
