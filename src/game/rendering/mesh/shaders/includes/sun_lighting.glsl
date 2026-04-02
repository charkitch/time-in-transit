vec3 toStar = normalize(-vWorldPosition);
float sunDot = dot(vWorldNormal, toStar);
vec3 noisePos = normalize(vLocalPos) * 2.0 + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
