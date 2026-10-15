const DEFAULT_ICONS = import.meta.glob<string>('../../../assets/png/default/ui/{controls,hud}/icon_*.png', {
  query: '?url',
  import: 'default',
  eager: true,
});
const RETINA_ICONS = import.meta.glob<string>('../../../assets/png/retina/ui/{controls,hud}/icon_*.png', {
  query: '?url',
  import: 'default',
  eager: true,
});

export type IconName =
  | 'close'
  | 'fire_front'
  | 'fire_left'
  | 'fire_right'
  | 'forward'
  | 'home'
  | 'minus'
  | 'pause'
  | 'play'
  | 'plus'
  | 'restart'
  | 'settings'
  | 'turn_left'
  | 'turn_right'
  | 'heart'
  | 'score'
  | 'time';

function find(map: Record<string, string>, name: IconName): string {
  const entry = Object.entries(map).find(([path]) => path.endsWith(`/icon_${name}.png`));
  return entry?.[1] ?? '';
}

export function iconSources(name: IconName): { src: string; srcSet: string } {
  const src = find(DEFAULT_ICONS, name);
  const retina = find(RETINA_ICONS, name);
  return { src, srcSet: retina ? `${src} 1x, ${retina} 2x` : src };
}
