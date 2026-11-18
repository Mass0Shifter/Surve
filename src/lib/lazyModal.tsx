import React, { Suspense } from 'react';

const RELOAD_FLAG = 'nsurvey_chunk_reload';

/**
 * Loads a code-split chunk; if it fails because a new version was deployed
 * (old chunk names no longer exist), reload the page once to pick up the new build.
 */
function withReload<T>(loader: () => Promise<T>): () => Promise<T> {
  return () =>
    loader()
      .then((m) => {
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
        return m;
      })
      .catch((err) => {
        let reloaded = false;
        try { reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* ignore */ }
        if (!reloaded) {
          try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* ignore */ }
          window.location.reload();
          return new Promise<T>(() => {});
        }
        throw err;
      });
}

const Loading: React.FC = () => (
  <div className="modal-overlay" aria-busy="true">
    <div className="app-boot-spinner" />
  </div>
);

/**
 * Wraps a modal so its code is only downloaded the first time it is opened.
 * The modal must take an `isOpen` prop and render nothing when closed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWhenOpen<C extends React.ComponentType<any>>(
  loader: () => Promise<{ default: C }>
): React.FC<React.ComponentProps<C>> {
  type P = React.ComponentProps<C>;
  const Lazy = React.lazy(withReload(loader)) as unknown as React.ComponentType<P>;
  const Wrapped: React.FC<P> = (props) =>
    props.isOpen ? (
      <Suspense fallback={<Loading />}>
        <Lazy {...props} />
      </Suspense>
    ) : null;
  return Wrapped;
}
