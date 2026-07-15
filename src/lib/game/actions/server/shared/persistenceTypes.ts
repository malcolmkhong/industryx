export type PersistResult<T> = ({ ok: true } & T) | { ok: false; response: Response };
