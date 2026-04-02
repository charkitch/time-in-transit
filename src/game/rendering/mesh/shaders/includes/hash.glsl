float hash(vec2 p, float s) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + s) * 43758.5453);
}
