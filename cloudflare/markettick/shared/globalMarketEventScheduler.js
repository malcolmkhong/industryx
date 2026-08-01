// Shared global-market event lifecycle. The Cloudflare market worker owns
// scheduling; persisted state is committed atomically by apply_market_tick.

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function parseIso(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isFiniteProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validEffect(effect) {
  return isRecord(effect)
    && effect.type === 'marketPriceMultiplier'
    && typeof effect.target === 'string'
    && effect.target.length > 0
    && typeof effect.value === 'number'
    && Number.isFinite(effect.value)
    && effect.value > 0;
}

export function parseGlobalMarketEventSchedule(row) {
  if (!isRecord(row)
    || row.id !== 'global'
    || !isPositiveInteger(row.check_interval_seconds)
    || !isFiniteProbability(Number(row.trigger_chance))
    || row.max_active_events !== 1
    || !isPositiveInteger(row.cooldown_seconds)) {
    return null;
  }

  return {
    checkIntervalSeconds: row.check_interval_seconds,
    triggerChance: Number(row.trigger_chance),
    cooldownSeconds: row.cooldown_seconds,
  };
}

export function parseGlobalMarketEventTemplates(rows) {
  if (!Array.isArray(rows)) return null;

  const templates = [];
  for (const row of rows) {
    if (!isRecord(row) || row.scope !== 'global_market') continue;
    if (row.is_active !== true
      || row.duration_unit !== 'seconds'
      || typeof row.id !== 'string'
      || row.id.length === 0
      || typeof row.name !== 'string'
      || typeof row.description !== 'string'
      || typeof row.icon !== 'string'
      || !isPositiveInteger(row.selection_weight)
      || !isPositiveInteger(row.duration_min)
      || !isPositiveInteger(row.duration_max)
      || row.duration_max < row.duration_min
      || !Array.isArray(row.effects)
      || row.effects.some((effect) => !validEffect(effect))) {
      return null;
    }

    templates.push(row);
  }
  return templates;
}

function chooseWeighted(templates, roll) {
  const total = templates.reduce((sum, template) => sum + template.selection_weight, 0);
  let threshold = roll * total;
  for (const template of templates) {
    threshold -= template.selection_weight;
    if (threshold < 0) return template;
  }
  return templates.at(-1) ?? null;
}

function createActiveEvent(template, nowMs, random) {
  const durationSeconds = template.duration_min
    + Math.floor(random() * (template.duration_max - template.duration_min + 1));
  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    icon: template.icon,
    effects: template.effects.map((effect, index) => ({
      id: typeof effect.id === 'string' ? effect.id : `${template.id}-effect-${index}`,
      type: effect.type,
      target: effect.target,
      value: effect.value,
    })),
    startedAt: toIso(nowMs),
    expiresAt: toIso(nowMs + durationSeconds * 1000),
  };
}

/**
 * Applies lifecycle transitions at a worker-owned server time. No local or
 * client time is accepted. The caller persists the returned object through
 * the market RPC in the same transaction as its price tick.
 */
export function advanceGlobalMarketEvent({
  activeEvent,
  cooldownUntil,
  nextCheckAt,
  templates,
  schedule,
  nowMs,
  random,
}) {
  if (!Number.isFinite(nowMs) || typeof random !== 'function' || !Array.isArray(templates)) {
    throw new Error('Invalid global market event scheduler input');
  }
  if (!isRecord(schedule)
    || !isPositiveInteger(schedule.checkIntervalSeconds)
    || !isFiniteProbability(schedule.triggerChance)
    || !isPositiveInteger(schedule.cooldownSeconds)) {
    throw new Error('Invalid global market event schedule');
  }

  const activeExpiry = isRecord(activeEvent) ? parseIso(activeEvent.expiresAt) : null;
  if (activeExpiry !== null && activeExpiry > nowMs) {
    return { activeEvent, cooldownUntil, nextCheckAt };
  }

  if (activeEvent !== null && activeEvent !== undefined) {
    const cooldownEnds = nowMs + schedule.cooldownSeconds * 1000;
    return {
      activeEvent: null,
      cooldownUntil: toIso(cooldownEnds),
      nextCheckAt: toIso(cooldownEnds),
    };
  }

  const cooldownMs = parseIso(cooldownUntil);
  if (cooldownMs !== null && cooldownMs > nowMs) {
    return { activeEvent: null, cooldownUntil, nextCheckAt: toIso(cooldownMs) };
  }

  const dueAtMs = parseIso(nextCheckAt);
  if (dueAtMs !== null && dueAtMs > nowMs) {
    return { activeEvent: null, cooldownUntil: null, nextCheckAt };
  }

  const nextDue = toIso(nowMs + schedule.checkIntervalSeconds * 1000);
  if (templates.length === 0 || random() >= schedule.triggerChance) {
    return { activeEvent: null, cooldownUntil: null, nextCheckAt: nextDue };
  }

  const selected = chooseWeighted(templates, random());
  if (!selected) return { activeEvent: null, cooldownUntil: null, nextCheckAt: nextDue };

  return {
    activeEvent: createActiveEvent(selected, nowMs, random),
    cooldownUntil: null,
    nextCheckAt: nextDue,
  };
}

/**
 * Global events affect the quote at read/trade time. The raw market series is
 * never multiplied each minute, preventing duration-long compounding.
 */
export function buildGlobalMarketPriceMultipliers(activeEvent, nowMs) {
  if (!isRecord(activeEvent) || parseIso(activeEvent.expiresAt) === null || parseIso(activeEvent.expiresAt) <= nowMs) {
    return {};
  }
  if (!Array.isArray(activeEvent.effects)) return {};

  const multipliers = {};
  for (const effect of activeEvent.effects) {
    if (!validEffect(effect)) continue;
    multipliers[effect.target] = (multipliers[effect.target] ?? 1) * effect.value;
  }
  return multipliers;
}
