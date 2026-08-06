import {
  evaluateMetric,
  type MetricEvaluationResult,
} from "@datapulse/metric-runtime";

/**
 * M0-049 Creator 包级合同 seam。这里仅委托共享运行时，不复制合并或求值逻辑。
 * M0-015 的浏览器 composition 也必须通过这一入口取得确定性指标结果。
 */
export function evaluateCreatorMetric(
  plan: unknown,
  accumulators: unknown,
): MetricEvaluationResult {
  return evaluateMetric(plan, accumulators);
}
