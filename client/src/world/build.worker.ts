import { solidsTree, transferables } from './district-merge';

/** Build worker: builds a district's collision BVH off the main thread. */
self.onmessage = (e: MessageEvent<{ id: number; position: Float32Array }>) => {
  const tree = solidsTree(e.data.position);
  (self as unknown as Worker).postMessage({ id: e.data.id, tree }, transferables(tree));
};
