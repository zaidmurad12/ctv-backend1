export type Either<L, R> = { ok: true; value: R } | { ok: false; error: L };

export function right<R>(value: R): Either<never, R> {
  return { ok: true, value };
}

export function left<L>(error: L): Either<L, never> {
  return { ok: false, error };
}

export function isRight<L, R>(value: Either<L, R>): value is { ok: true; value: R } {
  return value.ok;
}

export function isLeft<L, R>(value: Either<L, R>): value is { ok: false; error: L } {
  return !value.ok;
}
