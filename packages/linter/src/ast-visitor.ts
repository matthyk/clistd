import type {
  AllOfConditionAst,
  AllOrNoneConstraintAst,
  AnyOfConditionAst,
  ArgumentAst,
  AstNode,
  BooleanFlagAst,
  CliDocumentAst,
  CommandAliasAst,
  CommandAst,
  CountConstraintAst,
  EqualityConditionAst,
  ExitCodeAst,
  NotConditionAst,
  OutputAst,
  RequiresConstraintAst,
  TopicAst,
  ValueFlagAst,
} from '@clistd/core';

export type AstVisitorCallback<Node extends AstNode> = (node: Node) => void;

/**
 * Typed callbacks for every AST node owned by @clistd/core.
 *
 * `onCommand` is a node-type callback. `onCommandEnter` and
 * `onCommandLeave` bracket traversal of a command's descendants.
 */
export interface AstVisitor {
  readonly onDocument?: AstVisitorCallback<CliDocumentAst>;
  readonly onTopic?: AstVisitorCallback<TopicAst>;
  readonly onCommand?: AstVisitorCallback<CommandAst>;
  readonly onCommandEnter?: AstVisitorCallback<CommandAst>;
  readonly onCommandLeave?: AstVisitorCallback<CommandAst>;
  readonly onCommandAlias?: AstVisitorCallback<CommandAliasAst>;
  readonly onArgument?: AstVisitorCallback<ArgumentAst>;
  readonly onBooleanFlag?: AstVisitorCallback<BooleanFlagAst>;
  readonly onValueFlag?: AstVisitorCallback<ValueFlagAst>;
  readonly onRequiresConstraint?: AstVisitorCallback<RequiresConstraintAst>;
  readonly onCountConstraint?: AstVisitorCallback<CountConstraintAst>;
  readonly onAllOrNoneConstraint?: AstVisitorCallback<AllOrNoneConstraintAst>;
  readonly onOutput?: AstVisitorCallback<OutputAst>;
  readonly onEqualityCondition?: AstVisitorCallback<EqualityConditionAst>;
  readonly onAllOfCondition?: AstVisitorCallback<AllOfConditionAst>;
  readonly onAnyOfCondition?: AstVisitorCallback<AnyOfConditionAst>;
  readonly onNotCondition?: AstVisitorCallback<NotConditionAst>;
  readonly onExitCode?: AstVisitorCallback<ExitCodeAst>;
}

export function visitAst(ast: CliDocumentAst, visitors: readonly AstVisitor[]): void {
  const callbacks = indexCallbacks(visitors);
  dispatch(callbacks.onDocument, ast);

  for (const topic of ast.topics) dispatch(callbacks.onTopic, topic);
  for (const command of ast.commands) visitCommand(command, callbacks);
}

interface CallbackIndex {
  readonly onDocument: AstVisitorCallback<CliDocumentAst>[];
  readonly onTopic: AstVisitorCallback<TopicAst>[];
  readonly onCommand: AstVisitorCallback<CommandAst>[];
  readonly onCommandEnter: AstVisitorCallback<CommandAst>[];
  readonly onCommandLeave: AstVisitorCallback<CommandAst>[];
  readonly onCommandAlias: AstVisitorCallback<CommandAliasAst>[];
  readonly onArgument: AstVisitorCallback<ArgumentAst>[];
  readonly onBooleanFlag: AstVisitorCallback<BooleanFlagAst>[];
  readonly onValueFlag: AstVisitorCallback<ValueFlagAst>[];
  readonly onRequiresConstraint: AstVisitorCallback<RequiresConstraintAst>[];
  readonly onCountConstraint: AstVisitorCallback<CountConstraintAst>[];
  readonly onAllOrNoneConstraint: AstVisitorCallback<AllOrNoneConstraintAst>[];
  readonly onOutput: AstVisitorCallback<OutputAst>[];
  readonly onEqualityCondition: AstVisitorCallback<EqualityConditionAst>[];
  readonly onAllOfCondition: AstVisitorCallback<AllOfConditionAst>[];
  readonly onAnyOfCondition: AstVisitorCallback<AnyOfConditionAst>[];
  readonly onNotCondition: AstVisitorCallback<NotConditionAst>[];
  readonly onExitCode: AstVisitorCallback<ExitCodeAst>[];
}

function indexCallbacks(visitors: readonly AstVisitor[]): CallbackIndex {
  const callbacks: CallbackIndex = {
    onDocument: [],
    onTopic: [],
    onCommand: [],
    onCommandEnter: [],
    onCommandLeave: [],
    onCommandAlias: [],
    onArgument: [],
    onBooleanFlag: [],
    onValueFlag: [],
    onRequiresConstraint: [],
    onCountConstraint: [],
    onAllOrNoneConstraint: [],
    onOutput: [],
    onEqualityCondition: [],
    onAllOfCondition: [],
    onAnyOfCondition: [],
    onNotCondition: [],
    onExitCode: [],
  };

  for (const visitor of visitors) {
    if (visitor.onDocument !== undefined) callbacks.onDocument.push(visitor.onDocument);
    if (visitor.onTopic !== undefined) callbacks.onTopic.push(visitor.onTopic);
    if (visitor.onCommand !== undefined) callbacks.onCommand.push(visitor.onCommand);
    if (visitor.onCommandEnter !== undefined) callbacks.onCommandEnter.push(visitor.onCommandEnter);
    if (visitor.onCommandLeave !== undefined) callbacks.onCommandLeave.push(visitor.onCommandLeave);
    if (visitor.onCommandAlias !== undefined) callbacks.onCommandAlias.push(visitor.onCommandAlias);
    if (visitor.onArgument !== undefined) callbacks.onArgument.push(visitor.onArgument);
    if (visitor.onBooleanFlag !== undefined) callbacks.onBooleanFlag.push(visitor.onBooleanFlag);
    if (visitor.onValueFlag !== undefined) callbacks.onValueFlag.push(visitor.onValueFlag);
    if (visitor.onRequiresConstraint !== undefined) {
      callbacks.onRequiresConstraint.push(visitor.onRequiresConstraint);
    }
    if (visitor.onCountConstraint !== undefined) {
      callbacks.onCountConstraint.push(visitor.onCountConstraint);
    }
    if (visitor.onAllOrNoneConstraint !== undefined) {
      callbacks.onAllOrNoneConstraint.push(visitor.onAllOrNoneConstraint);
    }
    if (visitor.onOutput !== undefined) callbacks.onOutput.push(visitor.onOutput);
    if (visitor.onEqualityCondition !== undefined) {
      callbacks.onEqualityCondition.push(visitor.onEqualityCondition);
    }
    if (visitor.onAllOfCondition !== undefined)
      callbacks.onAllOfCondition.push(visitor.onAllOfCondition);
    if (visitor.onAnyOfCondition !== undefined)
      callbacks.onAnyOfCondition.push(visitor.onAnyOfCondition);
    if (visitor.onNotCondition !== undefined) callbacks.onNotCondition.push(visitor.onNotCondition);
    if (visitor.onExitCode !== undefined) callbacks.onExitCode.push(visitor.onExitCode);
  }

  return callbacks;
}

function visitCommand(command: CommandAst, callbacks: CallbackIndex): void {
  dispatch(callbacks.onCommand, command);
  dispatch(callbacks.onCommandEnter, command);

  for (const alias of command.aliases) dispatch(callbacks.onCommandAlias, alias);
  for (const argument of command.arguments) dispatch(callbacks.onArgument, argument);
  for (const flag of command.flags) {
    if (flag.kind === 'boolean') dispatch(callbacks.onBooleanFlag, flag);
    else dispatch(callbacks.onValueFlag, flag);
  }
  for (const constraint of command.constraints) {
    switch (constraint.kind) {
      case 'requires':
        dispatch(callbacks.onRequiresConstraint, constraint);
        break;
      case 'count':
        dispatch(callbacks.onCountConstraint, constraint);
        break;
      case 'all-or-none':
        dispatch(callbacks.onAllOrNoneConstraint, constraint);
        break;
    }
  }
  for (const output of command.outputs) {
    dispatch(callbacks.onOutput, output);
    if (output.when !== undefined) visitCondition(output.when, callbacks);
  }
  for (const exitCode of command.exitCodes) dispatch(callbacks.onExitCode, exitCode);

  dispatch(callbacks.onCommandLeave, command);
}

function visitCondition(
  condition: AllOfConditionAst | AnyOfConditionAst | EqualityConditionAst | NotConditionAst,
  callbacks: CallbackIndex,
): void {
  switch (condition.kind) {
    case 'equality-condition':
      dispatch(callbacks.onEqualityCondition, condition);
      break;
    case 'all-of-condition':
      dispatch(callbacks.onAllOfCondition, condition);
      for (const nestedCondition of condition.conditions)
        visitCondition(nestedCondition, callbacks);
      break;
    case 'any-of-condition':
      dispatch(callbacks.onAnyOfCondition, condition);
      for (const nestedCondition of condition.conditions)
        visitCondition(nestedCondition, callbacks);
      break;
    case 'not-condition':
      dispatch(callbacks.onNotCondition, condition);
      visitCondition(condition.condition, callbacks);
      break;
  }
}

function dispatch<Node extends AstNode>(
  callbacks: readonly AstVisitorCallback<Node>[],
  node: Node,
): void {
  for (const callback of callbacks) callback(node);
}
