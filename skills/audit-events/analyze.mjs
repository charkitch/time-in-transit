#!/usr/bin/env node
// Audit the authored event/story content for "hollowness": one-shot events with
// no lasting consequence, state that is written but never read, thin pools, and
// planet surfaces with no dedicated content.
//
// Run from anywhere inside the repo:  node skills/audit-events/analyze.mjs
// Requires js-yaml (already a dev dependency in the repo root node_modules).

import yaml from 'js-yaml'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Locate the repo root by walking up to the dir holding engine/content ─────
const findRoot = (start) => {
  let dir = start
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'engine/content/events'))) return dir
    dir = dirname(dir)
  }
  throw new Error('could not find engine/content/events above ' + start)
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)))
const EVENTS_DIR = join(ROOT, 'engine/content/events')
const TRIGGERS_DIR = join(ROOT, 'engine/content/triggers')

// Every EventCondition variant from engine/content-types/src/lib.rs. Each tag may
// appear as a scalar, sequence, or mapping, so register all three kinds.
const CONDITION_TAGS = [
  'PoliticsIs', 'SpecialSystemIs', 'MinGalaxyYear', 'MinYearsSinceEvent',
  'MaxYearsSinceEvent', 'EventCompletedInCurrentSystem', 'EventCompletedOutsideCurrentSystem',
  'HasFactionTag', 'HasCargo', 'VisitedSystem', 'MinCluster', 'MinReputation',
  'FlagSet', 'FlagNotSet', 'AnyFlagSet', 'AnyFlagNotSet', 'SurfaceIs', 'SiteClassIs',
  'HostTypeIs', 'TriggerFired', 'ChainTargetHere', 'GalacticFlag', 'GalacticFlagNotSet',
  'HasCrewMember',
]
// Every SurfaceType from content-types (snake_case as it appears in YAML).
const ALL_SURFACES = [
  'continental', 'ocean', 'marsh', 'venus', 'barren',
  'desert', 'ice', 'volcanic', 'forest_moon', 'mountain',
]

const SCHEMA = yaml.DEFAULT_SCHEMA.extend(
  CONDITION_TAGS.flatMap((name) =>
    ['scalar', 'sequence', 'mapping'].map((kind) => new yaml.Type('!' + name, {
      kind,
      resolve: () => true,
      construct: (data) => ({ __cond: name, value: data }),
    })),
  ),
)

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.yaml') ? [p] : []
  })
const load = (p) => yaml.load(readFileSync(p, 'utf8'), { schema: SCHEMA })

const events = walk(EVENTS_DIR).map((p) => ({
  pool: relative(EVENTS_DIR, p).split('/')[0],
  file: relative(EVENTS_DIR, p),
  data: load(p),
}))
const triggers = readdirSync(TRIGGERS_DIR)
  .filter((f) => f.endsWith('.yaml'))
  .flatMap((f) => load(join(TRIGGERS_DIR, f)).triggers || [])

// ── Helpers ──────────────────────────────────────────────────────────────────
const allChoices = (choices = []) =>
  choices.flatMap((c) => [c, ...allChoices(c.nextMoment?.choices)])

const effectIsEmpty = (e = {}) =>
  Object.entries(e).every(([k, v]) =>
    k === 'priceModifier' ? v === 1.0
      : Array.isArray(v) ? v.length === 0
      : typeof v === 'number' ? v === 0
      : v == null)

const conditionsOf = (event) => [
  ...(event.requires || []),
  ...allChoices(event.choices).flatMap((c) => c.requires || []),
]

// ── Produced vs. consumed state ───────────────────────────────────────────────
const produced = { flags: new Set(), galacticFlags: new Set(), fires: new Set(), factionTags: new Set() }
events.forEach(({ data }) => allChoices(data.choices).forEach((c) => {
  const e = c.effect || {}
  ;(e.setsFlags || []).forEach((f) => produced.flags.add(f))
  ;(e.setsGalacticFlags || []).forEach((f) => produced.galacticFlags.add(f))
  ;(e.fires || []).forEach((f) => produced.fires.add(f))
  if (e.factionTag) produced.factionTags.add(e.factionTag)
}))

const consumed = { flags: new Set(), galacticFlags: new Set(), fires: new Set(), factionTags: new Set() }
const COND_BUCKET = {
  FlagSet: 'flags', FlagNotSet: 'flags', AnyFlagSet: 'flags', AnyFlagNotSet: 'flags',
  GalacticFlag: 'galacticFlags', GalacticFlagNotSet: 'galacticFlags',
  TriggerFired: 'fires', HasFactionTag: 'factionTags',
}
const recordCond = ({ __cond, value }) => {
  const bucket = COND_BUCKET[__cond]
  if (bucket) consumed[bucket].add(value)
}
events.forEach(({ data }) => conditionsOf(data).forEach((c) => c?.__cond && recordCond(c)))
triggers.forEach((t) => (t.conditions || []).forEach((c) => c?.__cond && recordCond(c)))
events.forEach(({ data }) => data.triggeredBy && consumed.fires.add(data.triggeredBy))
const triggerIds = new Set(triggers.map((t) => t.id))

const diff = (a, b) => [...a].filter((x) => !b.has(x)).sort()
const section = (t) => console.log(`\n=== ${t} ===`)
const list = (arr, label) => arr.length ? arr.forEach((x) => console.log(`  ${label}${x}`)) : console.log('  (none)')

// ── Report ─────────────────────────────────────────────────────────────────
section('POOL COVERAGE (events per pool)')
const byPool = {}
events.forEach((e) => (byPool[e.pool] = (byPool[e.pool] || 0) + 1))
Object.entries(byPool).sort((a, b) => b[1] - a[1])
  .forEach(([p, n]) => console.log(`  ${p.padEnd(20)} ${n}${n <= 2 ? '   <-- thin' : ''}`))

section('PLANET SURFACE COVERAGE (surfaces with a dedicated planet_landing event)')
const planetSurfaceCovered = new Set()
events.filter((e) => e.pool === 'planet_landing').forEach(({ data }) =>
  conditionsOf(data).forEach((c) => {
    if (c?.__cond === 'SurfaceIs') [].concat(c.value).forEach((s) => planetSurfaceCovered.add(s))
  }))
ALL_SURFACES.forEach((s) =>
  console.log(`  ${s.padEnd(14)} ${planetSurfaceCovered.has(s) ? 'covered' : 'NO dedicated event -> generic fallback'}`))

section('EVENTS WITH NO MECHANICAL IMPACT (every choice empty, no follow-up)')
list(events.filter(({ data }) => {
  const cs = allChoices(data.choices)
  return cs.every((c) => effectIsEmpty(c.effect)) && !cs.some((c) => c.nextMoment)
}).map((e) => `[${e.pool}] ${e.data.id}`), '')

section('DANGLING: system flags SET but never READ by any condition (choices that go nowhere)')
list(diff(produced.flags, consumed.flags), 'flag: ')

section('DANGLING: galactic flags SET but never READ')
list(diff(produced.galacticFlags, consumed.galacticFlags), 'gflag: ')

section('DANGLING: faction tags SET but never gated on (alignment without payoff)')
list(diff(produced.factionTags, consumed.factionTags), 'factionTag: ')

section('DANGLING: triggers FIRED with no consumer')
list(diff(produced.fires, new Set([...consumed.fires, ...triggerIds])), 'fire: ')

section('BROKEN: conditions reading flags/triggers that are never produced')
list([
  ...diff(consumed.flags, produced.flags).map((f) => 'flag ' + f),
  ...diff(consumed.galacticFlags, produced.galacticFlags).map((f) => 'gflag ' + f),
  ...[...produced.fires].filter((f) => !triggerIds.has(f)).map((f) => 'fires undefined trigger ' + f),
], 'reads unset: ')

section('EFFECT-LEVER USAGE (how often each consequence lever is pulled)')
const levers = {}
events.forEach(({ data }) => allChoices(data.choices).forEach((c) =>
  Object.entries(c.effect || {}).forEach(([k, v]) => {
    if (!effectIsEmpty({ [k]: v })) levers[k] = (levers[k] || 0) + 1
  })))
;['tradingReputation', 'creditsReward', 'fuelReward', 'priceModifier', 'setsFlags',
  'fires', 'setsGalacticFlags', 'factionTag', 'galaxyYearsAdvance', 'grantsUpgrade',
  'recruitsCrew', 'bannedGoods'].forEach((k) =>
  console.log(`  ${k.padEnd(20)} ${levers[k] || 0}${!levers[k] ? '   <-- NEVER used' : ''}`))

console.log(`\n  ${events.length} events across ${Object.keys(byPool).length} pools, ${triggers.length} triggers.`)
