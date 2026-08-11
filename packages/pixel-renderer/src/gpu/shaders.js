export const WEBGL_VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 v_uv;

void main() {
  vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  vec2 position = positions[gl_VertexID];
  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

export const WEBGL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_overlay;
uniform sampler2D u_world_overlay;
uniform vec4 u_source;
uniform vec4 u_world_source;
uniform vec2 u_canvas_size;
uniform vec2 u_scene_size;
uniform vec2 u_sampling;
uniform vec4 u_effect;
uniform vec4 u_tint;
uniform vec4 u_feedback;
in vec2 v_uv;
out vec4 out_color;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 345.45));
  point += dot(point, point + 34.345);
  return fract(point.x * point.y);
}

void main() {
  vec2 scene_uv = u_source.xy + v_uv * u_source.zw;
  vec4 color = texture(u_scene, scene_uv);
  vec2 texel = 1.0 / max(u_scene_size, vec2(1.0));
  float rgb_split_texels = u_sampling.y;
  if (rgb_split_texels > 0.0) {
    vec2 shift = vec2(rgb_split_texels, 0.0) * texel;
    color.r = texture(u_scene, clamp(scene_uv + shift, u_source.xy, u_source.xy + u_source.zw)).r;
    color.b = texture(u_scene, clamp(scene_uv - shift, u_source.xy, u_source.xy + u_source.zw)).b;
  }
  float mode = u_effect.y;
  float time = u_effect.x * u_effect.w;
  float intensity = u_effect.z;

  float atmosphere = 0.025 + intensity * 0.045;
  color.rgb = mix(color.rgb, u_tint.rgb, atmosphere);

  if (mode > 1.5 && mode < 2.5) {
    float fog = smoothstep(0.36, 1.0, hash21(floor((v_uv + time * 0.002) * 55.0))) * 0.055 * intensity;
    color.rgb += u_tint.rgb * fog;
  }
  if (mode > 2.5 && mode < 4.5) {
    float sparkle = step(0.993, hash21(floor(v_uv * vec2(150.0, 90.0)) + floor(time * 2.0)));
    color.rgb += u_tint.rgb * sparkle * 0.16 * intensity;
  }

  float scanline = step(0.75, fract((gl_FragCoord.y - 0.5) / max(4.0, u_sampling.x)));
  color.rgb *= 1.0 - scanline * u_feedback.w;
  float vignette = smoothstep(0.36, 0.76, length(v_uv - 0.5));
  color.rgb *= 1.0 - vignette * u_tint.a;

  float power = u_feedback.x;
  float hit = u_feedback.y;
  color.rgb = mix(color.rgb, color.rgb * 0.72 + vec3(0.32, 0.95, 0.9) * 0.45, power * (0.22 + sin(u_effect.x * 9.0) * 0.06));
  color.rgb = mix(color.rgb, vec3(1.0, 0.14, 0.1), hit * 0.38);

  vec2 world_overlay_uv = u_world_source.xy + v_uv * u_world_source.zw;
  vec4 world_overlay = texture(u_world_overlay, world_overlay_uv);
  color.rgb = mix(color.rgb, world_overlay.rgb, world_overlay.a);
  vec2 overlay_uv = vec2(gl_FragCoord.x / u_canvas_size.x, gl_FragCoord.y / u_canvas_size.y);
  vec4 overlay = texture(u_overlay, overlay_uv);
  out_color = vec4(mix(color.rgb, overlay.rgb, overlay.a), 1.0);
}`;

export const WEBGPU_SHADER = `
struct Uniforms {
  source: vec4f,
  worldSource: vec4f,
  canvasSceneSize: vec4f,
  effect: vec4f,
  tint: vec4f,
  feedback: vec4f,
  sampling: vec4f,
};

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var overlayTexture: texture_2d<f32>;
@group(0) @binding(2) var nearestSampler: sampler;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var worldOverlayTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let position = positions[index];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = vec2f(position.x * 0.5 + 0.5, 1.0 - (position.y * 0.5 + 0.5));
  return output;
}

fn hash21(input: vec2f) -> f32 {
  var point = fract(input * vec2f(123.34, 345.45));
  point += dot(point, point + vec2f(34.345));
  return fract(point.x * point.y);
}

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let sceneUv = uniforms.source.xy + input.uv * uniforms.source.zw;
  let color = textureSample(sceneTexture, nearestSampler, sceneUv);
  var rgb = color.rgb;
  let texel = vec2f(1.0) / max(uniforms.canvasSceneSize.zw, vec2f(1.0));
  let rgbSplitTexels = uniforms.sampling.y;
  if (rgbSplitTexels > 0.0) {
    let shift = vec2f(rgbSplitTexels, 0.0) * texel;
    let shiftedRed = textureSample(sceneTexture, nearestSampler, clamp(sceneUv + shift, uniforms.source.xy, uniforms.source.xy + uniforms.source.zw)).r;
    let shiftedBlue = textureSample(sceneTexture, nearestSampler, clamp(sceneUv - shift, uniforms.source.xy, uniforms.source.xy + uniforms.source.zw)).b;
    rgb = vec3f(shiftedRed, rgb.g, shiftedBlue);
  }
  let mode = uniforms.effect.y;
  let time = uniforms.effect.x * uniforms.effect.w;
  let intensity = uniforms.effect.z;

  rgb = mix(rgb, uniforms.tint.rgb, 0.025 + intensity * 0.045);
  if (mode > 1.5 && mode < 2.5) {
    let fog = smoothstep(0.36, 1.0, hash21(floor((input.uv + time * 0.002) * 55.0))) * 0.055 * intensity;
    rgb += uniforms.tint.rgb * fog;
  }
  if (mode > 2.5 && mode < 4.5) {
    let sparkle = step(0.993, hash21(floor(input.uv * vec2f(150.0, 90.0)) + floor(time * 2.0)));
    rgb += uniforms.tint.rgb * sparkle * 0.16 * intensity;
  }

  let scanline = step(0.75, fract((input.position.y - 0.5) / max(4.0, uniforms.sampling.x)));
  rgb *= 1.0 - scanline * uniforms.feedback.w;
  let vignette = smoothstep(0.36, 0.76, length(input.uv - vec2f(0.5)));
  rgb *= 1.0 - vignette * uniforms.tint.a;
  rgb = mix(rgb, rgb * 0.72 + vec3f(0.32, 0.95, 0.9) * 0.45, uniforms.feedback.x * (0.22 + sin(uniforms.effect.x * 9.0) * 0.06));
  rgb = mix(rgb, vec3f(1.0, 0.14, 0.1), uniforms.feedback.y * 0.38);

  let worldOverlayUv = uniforms.worldSource.xy + input.uv * uniforms.worldSource.zw;
  let worldOverlay = textureSample(worldOverlayTexture, nearestSampler, worldOverlayUv);
  rgb = mix(rgb, worldOverlay.rgb, worldOverlay.a);
  let overlayUv = vec2f(input.position.x / uniforms.canvasSceneSize.x, input.position.y / uniforms.canvasSceneSize.y);
  let overlay = textureSample(overlayTexture, nearestSampler, overlayUv);
  return vec4f(mix(rgb, overlay.rgb, overlay.a), 1.0);
}`;
