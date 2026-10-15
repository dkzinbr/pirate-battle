import { useSyncExternalStore } from 'react';

export type LogTab = 'ranking' | 'history';

export type Route =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'play' }
  | { name: 'result' }
  | { name: 'log'; tab: LogTab };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  switch (path) {
    case '/options':
      return { name: 'options' };
    case '/play':
      return { name: 'play' };
    case '/result':
      return { name: 'result' };
    case '/log/ranking':
      return { name: 'log', tab: 'ranking' };
    case '/log/history':
      return { name: 'log', tab: 'history' };
    default:
      return { name: 'menu' };
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/';
    case 'log':
      return `#/log/${route.tab}`;
    default:
      return `#/${route.name}`;
  }
}

let current: Route = parseHash(window.location.hash);
/** Incremented on every navigation; used to remount the play screen ("Play Again"). */
let navigationId = 0;
let snapshot = { route: current, navigationId };
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

function syncFromLocation(): void {
  const next = parseHash(window.location.hash);
  if (routeToHash(next) === routeToHash(current)) return;
  current = next;
  navigationId += 1;
  snapshot = { route: current, navigationId };
  emit();
}

window.addEventListener('hashchange', syncFromLocation);
window.addEventListener('popstate', syncFromLocation);

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route);
  current = route;
  navigationId += 1;
  snapshot = { route, navigationId };
  if (options.replace) window.history.replaceState(null, '', hash);
  else if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  emit();
}

/**
 * A reload must never resume a match: the in-progress match is abandoned and
 * the player lands on the main menu instead.
 */
export function normalizeInitialRoute(): void {
  if (current.name === 'play') navigate({ name: 'menu' }, { replace: true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoute(): { route: Route; navigationId: number } {
  return useSyncExternalStore(subscribe, () => snapshot);
}
