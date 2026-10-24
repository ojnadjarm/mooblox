import { MeshDepthMaterial } from 'three';

/** Shadow-pass material for instanced casters: three's one shared depth material would switch programs on every draw. */
export const INSTANCED_DEPTH = new MeshDepthMaterial();
/** Shadow-pass material for skinned casters (the kids), for the same reason. */
export const SKINNED_DEPTH = new MeshDepthMaterial();
