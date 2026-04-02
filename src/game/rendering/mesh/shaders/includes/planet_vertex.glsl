varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vLocalPos;
void main() {
  vLocalPos = position;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
