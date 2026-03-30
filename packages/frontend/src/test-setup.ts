import '@testing-library/jest-dom';
import { createElement, forwardRef } from 'react';

// Mock framer-motion so animations are no-ops in jsdom.
// AnimatePresence becomes a passthrough so exit animations don't hold
// elements in the DOM and block DOM assertions.
vi.mock('framer-motion', () => {
  const makeMotion = (tag: string) =>
    forwardRef(({ children, initial: _i, animate: _a, exit: _e, transition: _t, whileHover: _wh, layout: _l, ...props }: any, ref: any) =>
      createElement(tag, { ...props, ref }, children)
    );

  const motion = new Proxy({} as Record<string, ReturnType<typeof makeMotion>>, {
    get: (cache, tag: string) => {
      if (!cache[tag]) cache[tag] = makeMotion(tag);
      return cache[tag];
    },
  });

  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
    useMotionValue: (v: unknown) => ({ get: () => v, set: vi.fn() }),
  };
});
