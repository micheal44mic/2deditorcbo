window.CBO = window.CBO || {};

(function registerLiquifyEngine(namespace) {
  const LIQUIFY_PUSH_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_sourceTexture;
uniform vec2 u_sourceOrigin;
uniform vec2 u_sourceSize;
uniform vec2 u_center;
uniform vec2 u_direction;
uniform float u_radius;
uniform float u_strength;
uniform float u_pressure;
uniform float u_dragOffset;

in vec2 v_docPosition;

out vec4 outColor;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec4 sampleLayer(vec2 documentPosition) {
  vec2 sourceLocal = documentPosition - u_sourceOrigin;

  if (
    sourceLocal.x < 0.0 ||
    sourceLocal.y < 0.0 ||
    sourceLocal.x > u_sourceSize.x ||
    sourceLocal.y > u_sourceSize.y
  ) {
    return vec4(0.0);
  }

  vec2 uv = vec2(
    sourceLocal.x / max(u_sourceSize.x, 1.0),
    1.0 - sourceLocal.y / max(u_sourceSize.y, 1.0)
  );
  return texture(u_sourceTexture, clamp(uv, vec2(0.0), vec2(1.0)));
}

void main() {
  vec2 localPosition = v_docPosition - u_center;
  float radius = max(u_radius, 0.5);
  float distanceFromCenter = length(localPosition);

  if (distanceFromCenter > radius) {
    outColor = sampleLayer(v_docPosition);
    return;
  }

  float mask = 1.0 - smoothstep(radius * 0.18, radius, distanceFromCenter);
  float strength = saturate(u_strength * u_pressure);
  float displacement = u_dragOffset * strength * mask;
  vec2 sourcePos = v_docPosition - u_direction * displacement;

  outColor = sampleLayer(sourcePos);
}
`;

  const DEFAULT_LIQUIFY_SETTINGS = Object.freeze({
    mode: "push",
    pressureAffectsStrength: true,
    radius: 48,
    spacing: 0.055,
    strength: 0.72,
  });

  const DAB_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;

uniform vec2 u_targetOrigin;
uniform vec2 u_targetSize;
uniform vec4 u_bounds;

out vec2 v_docPosition;

void main() {
  vec2 documentPosition = u_bounds.xy + a_corner * u_bounds.zw;
  vec2 targetPosition = (documentPosition - u_targetOrigin) / max(u_targetSize, vec2(1.0));
  vec2 clipPosition = targetPosition * 2.0 - 1.0;

  clipPosition.y *= -1.0;
  v_docPosition = documentPosition;
  gl_Position = vec4(clipPosition, 0.0, 1.0);
}
`;

  namespace.liquifySettings = {
    ...DEFAULT_LIQUIFY_SETTINGS,
    ...(namespace.liquifySettings || {}),
  };

  class LiquifyEngine extends namespace.SmudgeEngine {
    createDabProgramInfo() {
      const gl = this.gl;
      const program = this.linkProgram(DAB_VERTEX_SHADER_SOURCE, LIQUIFY_PUSH_FRAGMENT_SHADER_SOURCE, "liquify push dab");

      return {
        program,
        uniforms: {
          center: gl.getUniformLocation(program, "u_center"),
          direction: gl.getUniformLocation(program, "u_direction"),
          dragOffset: gl.getUniformLocation(program, "u_dragOffset"),
          pressure: gl.getUniformLocation(program, "u_pressure"),
          radius: gl.getUniformLocation(program, "u_radius"),
          sourceOrigin: gl.getUniformLocation(program, "u_sourceOrigin"),
          sourceSize: gl.getUniformLocation(program, "u_sourceSize"),
          sourceTexture: gl.getUniformLocation(program, "u_sourceTexture"),
          strength: gl.getUniformLocation(program, "u_strength"),
          targetOrigin: gl.getUniformLocation(program, "u_targetOrigin"),
          targetSize: gl.getUniformLocation(program, "u_targetSize"),
          bounds: gl.getUniformLocation(program, "u_bounds"),
        },
      };
    }

    isSmudgeToolDetail(detail = {}) {
      const label = String(detail.label || "").toUpperCase();
      const toolMode = String(detail.toolMode || "").toLowerCase();

      return label === "LIQUIFY" || toolMode === "liquify";
    }

    handleSettingsChange(event) {
      if (event.detail?.tool !== "liquify") {
        return;
      }

      namespace.liquifySettings = {
        ...DEFAULT_LIQUIFY_SETTINGS,
        ...(event.detail.settings || {}),
        mode: "push",
      };
    }

    getSettings() {
      return {
        ...DEFAULT_LIQUIFY_SETTINGS,
        ...(namespace.liquifySettings || {}),
        mode: "push",
      };
    }

    getRadius() {
      return this.clamp(this.getSettings().radius, 1, 512);
    }

    getSpacing() {
      return this.clamp(this.getSettings().spacing, 0.005, 1);
    }

    getDrag() {
      return 1;
    }

    getStrength() {
      return this.clamp01(this.getSettings().strength);
    }

    getPressureStrength(pressure) {
      return this.getSettings().pressureAffectsStrength === false ? 1 : this.normalizePressure(pressure);
    }

    showEmptySmudgeLayerToast(message = "Nothing to liquify on this layer") {
      super.showEmptySmudgeLayerToast(message);
    }

    renderDabToScratch({
      bounds,
      cx,
      cy,
      direction,
      dragOffset,
      pressureStrength,
      radius,
      scratch,
      sourceTarget,
    }) {
      if (!sourceTarget?.texture || !scratch?.framebuffer || !bounds) {
        return false;
      }

      const gl = this.gl;
      const scratchRect = scratch.rect || bounds;
      const sourceRect = this.getRasterTargetDocumentRect(sourceTarget);
      const { program, uniforms } = this.dabProgramInfo;

      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
      gl.viewport(0, 0, scratch.width, scratch.height);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.uniform2f(uniforms.sourceOrigin, sourceRect.x, sourceRect.y);
      gl.uniform2f(uniforms.sourceSize, sourceRect.width, sourceRect.height);
      gl.uniform2f(uniforms.targetOrigin, scratchRect.x, scratchRect.y);
      gl.uniform2f(uniforms.targetSize, scratchRect.width, scratchRect.height);
      gl.uniform4f(uniforms.bounds, bounds.x, bounds.y, bounds.width, bounds.height);
      gl.uniform2f(uniforms.center, cx, cy);
      gl.uniform2f(uniforms.direction, direction.x, direction.y);
      gl.uniform1f(uniforms.radius, radius);
      gl.uniform1f(uniforms.strength, this.getStrength());
      gl.uniform1f(uniforms.pressure, pressureStrength);
      gl.uniform1f(uniforms.dragOffset, Math.max(0, dragOffset));
      gl.uniform1i(uniforms.sourceTexture, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTarget.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindVertexArray(this.quad.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);

      return true;
    }
  }

  namespace.LiquifyEngine = LiquifyEngine;
})(window.CBO);
