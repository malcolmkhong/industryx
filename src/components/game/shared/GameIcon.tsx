'use client';

import { Icon } from '@iconify/react';
import {
  RESOURCE_ICON_MAP,
  BUILDING_ICON_MAP,
  UI_ICON_MAP,
  WEATHER_ICON_MAP,
  TRANSPORT_ICON_MAP,
  WORKER_ICON_MAP,
  RESEARCH_ICON_MAP,
  MEGA_PROJECT_ICON_MAP,
} from '@/lib/game/iconMap';

export interface GameIconProps {
  /** Direct Iconify icon ID like 'gi:mining' or 'lucide:hammer' */
  icon?: string;
  /** Resource type key — auto-resolves to mapped icon */
  resource?: string;
  /** Building type key — auto-resolves to mapped icon */
  building?: string;
  /** Transport type key — auto-resolves to mapped icon */
  transport?: string;
  /** Worker type key — auto-resolves to mapped icon */
  worker?: string;
  /** Research ID key — auto-resolves to mapped icon */
  research?: string;
  /** Mega project type key — auto-resolves to mapped icon */
  megaProject?: string;
  /** Weather type key — auto-resolves to mapped icon */
  weather?: string;
  /** UI icon key — auto-resolves to mapped icon */
  ui?: string;
  /** Size in pixels (default: 16) */
  size?: number;
  /** CSS color override */
  color?: string;
  /** Additional CSS class names */
  className?: string;
  /** Inline style overrides */
  style?: React.CSSProperties;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Accessible label for screen readers */
  'aria-label'?: string;
}

/** Fallback icon used when no valid icon can be resolved */
const FALLBACK_ICON = 'gi:help';

/**
 * Validates that a value looks like a valid Iconify icon ID (prefix:name format).
 * Returns the value if valid, otherwise returns the fallback icon.
 */
function sanitizeIconId(value: unknown): string {
  if (typeof value !== 'string' || !value.includes(':')) {
    return FALLBACK_ICON;
  }
  return value;
}

/**
 * Resolves a game key to an Iconify icon ID using the appropriate mapping.
 * Priority: icon > resource > building > transport > worker > research > megaProject > weather > ui
 */
function resolveIconId(props: GameIconProps): string {
  if (props.icon) return sanitizeIconId(props.icon);

  if (props.resource && RESOURCE_ICON_MAP[props.resource]) {
    return RESOURCE_ICON_MAP[props.resource];
  }
  if (props.building && BUILDING_ICON_MAP[props.building]) {
    return BUILDING_ICON_MAP[props.building];
  }
  if (props.transport && TRANSPORT_ICON_MAP[props.transport]) {
    return TRANSPORT_ICON_MAP[props.transport];
  }
  if (props.worker && WORKER_ICON_MAP[props.worker]) {
    return WORKER_ICON_MAP[props.worker];
  }
  if (props.research && RESEARCH_ICON_MAP[props.research]) {
    return RESEARCH_ICON_MAP[props.research];
  }
  if (props.megaProject && MEGA_PROJECT_ICON_MAP[props.megaProject]) {
    return MEGA_PROJECT_ICON_MAP[props.megaProject];
  }
  if (props.weather && WEATHER_ICON_MAP[props.weather]) {
    return WEATHER_ICON_MAP[props.weather];
  }
  if (props.ui && UI_ICON_MAP[props.ui]) {
    return UI_ICON_MAP[props.ui];
  }

  return FALLBACK_ICON;
}

/**
 * Reusable game icon component that resolves game entity keys to SVG icons
 * using the @iconify/react library and the central icon mapping.
 *
 * Icons are pre-loaded by <IconPreloader> in layout.tsx.
 *
 * @example
 * <GameIcon icon="gi:mining" size={24} />
 * <GameIcon resource="iron" size={16} color="#a0a0a0" />
 * <GameIcon building="smelter" />
 * <GameIcon ui="build" />
 */
export function GameIcon({
  icon,
  resource,
  building,
  transport,
  worker,
  research,
  megaProject,
  weather,
  ui,
  size = 16,
  color,
  className,
  style,
  onClick,
  'aria-label': ariaLabel,
}: GameIconProps) {
  const iconId = resolveIconId({
    icon,
    resource,
    building,
    transport,
    worker,
    research,
    megaProject,
    weather,
    ui,
  });

  // Default to currentColor so icons inherit parent text color and remain visible on dark backgrounds.
  // If an explicit color is passed, it takes precedence. Otherwise currentColor ensures
  // the icon always matches the surrounding text and is never invisible.
  const resolvedColor = color ?? 'currentColor';

  return (
    <Icon
      icon={iconId}
      width={size}
      height={size}
      style={{ color: resolvedColor, ...style }}
      className={className}
      inline
      onClick={onClick}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    />
  );
}

export default GameIcon;
