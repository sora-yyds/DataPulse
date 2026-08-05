import type { DomainError } from "./errors.js";

export type ResultSuccess<Value> = Readonly<{
  ok: true;
  value: Value;
  error?: never;
}>;

export type ResultFailure<Error> = Readonly<{
  ok: false;
  error: Error;
  value?: never;
}>;

/**
 * 以 `ok` 为唯一判别字段的 Result DTO；Value／Error 的序列化性由其类型负责。
 * Domain 自身解析器只返回 JSON-safe 的字符串成功值或封闭错误 DTO。
 */
export type Result<Value, Error = DomainError> =
  | ResultSuccess<Value>
  | ResultFailure<Error>;

type ExpectFalse<Value extends false> = Value;
type _ResultSuccessRejectsError = ExpectFalse<
  { ok: true; value: string; error: string } extends Result<string, string> ? true : false
>;
type _ResultFailureRejectsValue = ExpectFalse<
  { ok: false; error: string; value: string } extends Result<string, string> ? true : false
>;

export type DomainResult<Value, Error extends DomainError = DomainError> = Result<
  Value,
  Error
>;

export function domainSuccess<Value>(value: Value): ResultSuccess<Value> {
  return Object.freeze({ ok: true, value });
}

export function domainFailure<Error extends DomainError>(
  error: Error,
): ResultFailure<Error> {
  return Object.freeze({ ok: false, error });
}
