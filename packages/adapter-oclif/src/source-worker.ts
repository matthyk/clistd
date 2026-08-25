import { adaptOclifProject } from './index.js';

const root = process.argv[2];

if (root === undefined) {
  throw new Error('Expected an Oclif project root.');
}

try {
  const result = await adaptOclifProject({ protocolVersion: '0.1', source: root });
  process.send?.({ document: result.document, type: 'result' });
} catch {
  process.send?.({ type: 'failure' });
}
