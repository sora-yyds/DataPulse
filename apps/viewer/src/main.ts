import {
  evaluateMetric,
  type MetricEvaluationResult,
} from "@datapulse/metric-runtime";

/**
 * M0-049 Viewer 包级合同 seam。这里仅委托共享运行时，不复制合并或求值逻辑。
 * 本入口不引入 Creator、导入、分析、AI 或本地项目存储能力。
 */
export function evaluateViewerMetric(
  plan: unknown,
  accumulators: unknown,
): MetricEvaluationResult {
  return evaluateMetric(plan, accumulators);
}
