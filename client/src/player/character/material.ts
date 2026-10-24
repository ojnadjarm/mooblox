import { MeshLambertMaterial, type Texture } from 'three';

/** How far the sun wraps past the terminator (0 = plain Lambert): soft, readable shade sides like a painted toy. */
export const WRAP = 0.55;

/** The shared character material: vertex colours times the face atlas, Lambert with wrapped sun light. */
export function characterMaterial(atlas: Texture): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', LAMBERT_WRAPPED);
  };
  m.customProgramCacheKey = () => 'mooblox-character';
  return m;
}

const LAMBERT_WRAPPED = /* glsl */ `
varying vec3 vViewPosition;
struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + ${WRAP.toFixed(2)} ) / ${(1 + WRAP).toFixed(2)} );
  reflectedLight.directDiffuse += dotNL * directLight.color * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;
