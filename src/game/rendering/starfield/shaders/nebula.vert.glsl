attribute vec3 aDirection;
attribute float aRadius;
attribute vec4 aShapeWeights;
attribute float aPaletteIndex;
attribute float aBrightness;
attribute float aSeed;
attribute float aElongation;
attribute float aRotation;

uniform float uSphereRadius;

varying vec2 vUv;
varying vec4 vShapeWeights;
varying float vPaletteIndex;
varying float vBrightness;
varying float vSeed;
varying float vElongation;

void main() {
  // Fixed tangent frame from direction — stable regardless of camera orientation
  vec3 normal = normalize(aDirection);
  vec3 refUp = abs(normal.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(refUp, normal));
  vec3 bitangent = cross(normal, tangent);

  // Apply per-nebula rotation within the tangent plane
  float cr = cos(aRotation);
  float sr = sin(aRotation);
  vec3 rotTangent   = tangent * cr + bitangent * sr;
  vec3 rotBitangent = -tangent * sr + bitangent * cr;

  // Scale by angular radius mapped to world size at sphere distance
  float worldSize = uSphereRadius * aRadius;
  vec3 center = normal * uSphereRadius;

  vec3 offset = rotTangent   * position.x * worldSize * aElongation
              + rotBitangent * position.y * worldSize;

  vec4 worldPos = modelMatrix * vec4(center + offset, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPos;

  vUv = uv;
  vShapeWeights = aShapeWeights;
  vPaletteIndex = aPaletteIndex;
  vBrightness = aBrightness;
  vSeed = aSeed;
  vElongation = aElongation;
}
