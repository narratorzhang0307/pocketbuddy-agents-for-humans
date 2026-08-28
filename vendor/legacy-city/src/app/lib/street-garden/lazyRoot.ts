type UnmountableRoot = {
  unmount: () => void;
};

export type LazyRootLifecycle = {
  readonly mounted: boolean;
  mount: () => void;
  unmount: () => void;
};

export function createLazyRootLifecycle(
  mountRoot: () => UnmountableRoot,
): LazyRootLifecycle {
  let root: UnmountableRoot | null = null;

  return {
    get mounted() {
      return root !== null;
    },
    mount() {
      if (root) return;
      root = mountRoot();
    },
    unmount() {
      if (!root) return;
      root.unmount();
      root = null;
    },
  };
}
