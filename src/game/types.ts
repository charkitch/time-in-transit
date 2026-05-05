/** Nominal branding — prevents accidental mixing of same-shaped primitives. */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type SystemId = Brand<number, 'SystemId'>;
export type GalaxyYear = Brand<number, 'GalaxyYear'>;
export type ScannableBodyId = Brand<string, 'ScannableBodyId'>;
export type FactionId = Brand<string, 'FactionId'>;
export type CrewMemberId = Brand<string, 'CrewMemberId'>;
