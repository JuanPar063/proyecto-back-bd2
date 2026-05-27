import { FunctionInWhereRule } from './function-in-where.rule';
import { GroupByWithoutFilterRule } from './group-by-without-filter.rule';
import { JoinWithoutOnRule } from './join-without-on.rule';
import { MissingWhereRule } from './missing-where.rule';
import { OrderByWithoutLimitRule } from './order-by-without-limit.rule';
import { SelectStarRule } from './select-star.rule';
import { SlowQueryRule } from './slow-query.rule';
import type { SqlRule } from './sql-rule.interface';

export const DEFAULT_RULES: SqlRule[] = [
  new SelectStarRule(),
  new MissingWhereRule(),
  new FunctionInWhereRule(),
  new OrderByWithoutLimitRule(),
  new JoinWithoutOnRule(),
  new GroupByWithoutFilterRule(),
  new SlowQueryRule(),
];

export {
  FunctionInWhereRule,
  GroupByWithoutFilterRule,
  JoinWithoutOnRule,
  MissingWhereRule,
  OrderByWithoutLimitRule,
  SelectStarRule,
  SlowQueryRule,
};
export type { SqlRule };
export type { SqlRuleContext } from './sql-rule.interface';
