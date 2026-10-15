import { useSyncExternalStore } from 'react';

type Subscribe = (listener: () => void) => () => void;
const subscribers = new Map<string, Subscribe>();

/** Stable subscribe function per query, so React does not resubscribe on every render. */
function subscribeMedia(query: string): Subscribe {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (listener) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', listener);
      return () => {
        media.removeEventListener('change', listener);
      };
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribeMedia(query), () => window.matchMedia(query).matches);
}

/** Touch pads are shown on coarse pointers or touch-capable screens, or with `?touch=1`. */
export function useTouchDevice(): boolean {
  const coarse = useMediaQuery('(pointer: coarse)');
  const forced = new URLSearchParams(window.location.search).get('touch') === '1';
  return coarse || forced || navigator.maxTouchPoints > 0;
}

export function usePortrait(): boolean {
  return useMediaQuery('(orientation: portrait)');
}
