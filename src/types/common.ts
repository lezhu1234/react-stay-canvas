type StayStoreKey<Schema extends object> = Extract<keyof Schema, string>
type StayStoreValue<Schema extends object> = Schema[StayStoreKey<Schema>]

/** A native Map view whose known string keys determine their value types. */
export type StayStore<Schema extends object = Record<string, any>> = Omit<
  Map<StayStoreKey<Schema>, StayStoreValue<Schema>>,
  "get" | "set"
> & {
  get<Key extends StayStoreKey<Schema>>(key: Key): Schema[Key] | undefined
  set<Key extends StayStoreKey<Schema>>(key: Key, value: Schema[Key]): StayStore<Schema>
}

export type storeType = Map<string, any>

export type StayStoreFor<Schema extends object = never> = [Schema] extends [never]
  ? storeType
  : StayStore<Schema>

export type Dict<T = any> = Record<string, T>

export type valueof<T> = T extends Record<string, infer V> ? V : never

export type NumericString = `${number}` | `+${number}` | `-${number}` | number

export type Positive<T extends number> = number extends T
  ? never
  : `${T}` extends `-${string}` | "0"
  ? never
  : T

export type Negative<T extends number> = number extends T
  ? never
  : Positive<T> extends never
  ? T extends 0
    ? never
    : T
  : never

export type NumberInRangeZeroOne<T extends number> = Positive<T> extends never
  ? T extends 0
    ? T
    : never
  : T extends number
  ? (T extends 1 ? T : never) | (`${T}` extends `0.${string}` ? T : never) | never
  : never

export type ZeroToOne = NumberInRangeZeroOne<number>
