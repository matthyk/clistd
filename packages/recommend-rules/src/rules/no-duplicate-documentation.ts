import type { Rule, RuleContext } from '@clistd/linter';

type DocumentedNode = Parameters<RuleContext['report']>[0]['node'] & {
  readonly cli?: { readonly name?: string };
  readonly code?: number;
  readonly summary?: string;
  readonly description?: string;
  readonly id?: string;
  readonly invocation?: readonly string[];
  readonly kind: string;
  readonly long?: string;
  readonly name?: string;
};

interface DocumentationOccurrence {
  readonly element: string;
  readonly field: 'summary' | 'description';
  readonly node: Parameters<RuleContext['report']>[0]['node'];
}

export const noDuplicateDocumentation: Rule = {
  meta: {
    id: 'clistd/no-duplicate-documentation',
    description: 'Disallow identical summaries and descriptions on different CLI elements.',
    defaultSeverity: 'error',
    prompt:
      'Rewrite one of the duplicate summaries or descriptions to document its specific element.',
  },
  create(context) {
    const occurrences = new Map<string, DocumentationOccurrence[]>();

    function check(node: DocumentedNode, field: 'summary' | 'description'): void {
      checkText(node, field, node[field]);
    }

    function checkText(
      node: DocumentedNode,
      field: 'summary' | 'description',
      value: string | undefined,
    ): void {
      const text = value?.trim();
      if (!text) return;

      const element = elementLabel(node);
      const previous = occurrences.get(text)?.find((occurrence) => occurrence.element !== element);
      if (previous !== undefined) {
        context.report({
          message: `The ${field} on ${element} duplicates the ${previous.field} on ${previous.element}.`,
          node,
          related: [previous.node],
        });
      }

      const existing = occurrences.get(text);
      const occurrence = { element, field, node };
      if (existing === undefined) occurrences.set(text, [occurrence]);
      else existing.push(occurrence);
    }

    function checkDocumentation(node: DocumentedNode): void {
      check(node, 'summary');
      check(node, 'description');
    }

    return {
      onDocument(document) {
        checkText(document, 'summary', document.cli.summary);
        checkText(document, 'description', document.cli.description);
      },
      onTopic: checkDocumentation,
      onCommand: checkDocumentation,
      onArgument: checkDocumentation,
      onBooleanFlag: checkDocumentation,
      onValueFlag: checkDocumentation,
      onOutput: checkDocumentation,
      onExitCode(exitCode) {
        check(exitCode, 'description');
      },
    };
  },
};

function elementLabel(node: DocumentedNode): string {
  switch (node.kind) {
    case 'argument':
      return node.name === undefined ? 'an argument' : `argument <${node.name}>`;
    case 'boolean':
    case 'value':
      return node.long === undefined ? 'a flag' : `flag --${node.long}`;
    case 'command': {
      const invocation = node.invocation?.join(' ') ?? node.id;
      return invocation === undefined ? 'a command' : `command ${invocation}`;
    }
    case 'document':
      return node.cli?.name === undefined ? 'the CLI' : `CLI ${node.cli.name}`;
    case 'exit-code':
      return node.code === undefined ? 'an exit code' : `exit code ${node.code}`;
    case 'output':
      return node.id === undefined ? 'an output' : `output ${node.id}`;
    case 'topic':
      return node.id === undefined ? 'a topic' : `topic ${node.id}`;
    default:
      return 'a CLI element';
  }
}
