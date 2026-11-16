// Opaque perspective texture spans from 45304c/44361b, reimplemented in JS.
const f = Math.fround,
  FIXED = 1_048_576;
export function textureDelta(requested = 128) {
  return 2 ** Math.floor(Math.log2(Math.max(8, Math.trunc(requested))));
}
export function nearestEven(value: number) {
  const low = Math.floor(value),
    fraction = value - low;
  if (fraction < 0.5) {
    return low;
  }
  if (fraction > 0.5) {
    return low + 1;
  }
  return low + (Math.abs(low) % 2);
}
export function magicInteger(value: number) {
  // The x87 "magic double" conversion first adds 3*2^51 at 64-bit
  // significand precision (a 1/2048 step there), then stores a double.
  // Preserve that double rounding instead of rounding the scaled value once.
  return nearestEven(nearestEven(value * 2048) / 2048) | 0;
}
function fixed(value: number) {
  return magicInteger(value * FIXED);
}
export function screenTextureSlopes(points: number[][], values: number[]) {
  const a = [
    f(points[0][0] - points[1][0]),
    f(points[0][1] - points[1][1]),
    f(values[0] - values[1]),
  ];
  const b = [
    f(points[2][0] - points[1][0]),
    f(points[2][1] - points[1][1]),
    f(values[2] - values[1]),
  ];
  const nx = f(a[1] * b[2] - a[2] * b[1]),
    ny = f(a[2] * (points[2][0] - points[1][0]) - a[0] * b[2]),
    nz = f(a[0] * b[1] - a[1] * b[0]),
    inverse = nz ? f(1 / nz) : 0;
  return [f(-nx * inverse), f(-ny * inverse)];
}
export function prepareTexturePlane(
  vertices: number[][],
  size: any[],
  { weightedUV = false } = {},
) {
  const p = vertices.map((v: number[]) => v.map((itemValue) => f(itemValue))),
    points = p.slice(0, 3).map((v: number[]) => v.slice(0, 2));
  const values = [
    p.map((v: any[]) => v[2]),
    p.map((v: number[]) =>
      f((weightedUV ? v[3] : f(v[3] * v[2])) * (size[0] - 1)),
    ),
    p.map((v: number[]) =>
      f((weightedUV ? v[4] : f(v[4] * v[2])) * (size[1] - 1)),
    ),
  ];
  return {
    origin: points[0],
    firstQ: p[0][2],
    size,
    values: values.map((v) => v[0]),
    slopes: values.map((v) => screenTextureSlopes(points, v)),
  };
}
export function textureSpanCommands(
  plane: { origin: any; firstQ: any; size?: any; values: any; slopes: any },
  { x, y, count }: { x: any; y: number; count: number },
  { delta: inputDelta = 128, far = 350 } = {},
) {
  if (count <= 0) {
    return [];
  }
  const delta = textureDelta(inputDelta);
  const dy = y - plane.origin[1];
  // Z retains the x87 Y subtraction; U/V reload its stored float copy.
  const rows = plane.values.map((v: number, i: number) =>
    f((i ? f(dy) : dy) * plane.slopes[i][1] + v),
  );
  let values = rows.map((v: number, i: number) =>
    f((x - plane.origin[0]) * plane.slopes[i][0] + v),
  );
  let u = f(values[1] / values[0]),
    v = f(values[2] / values[0]),
    offset = 0;
  const near = plane.firstQ > f(1 / f(far)),
    steps = plane.slopes.map((s: number[]) => f(s[0] * delta)),
    commands = [];
  const blocks = near ? Math.floor(count / delta) : 0;
  for (let block = 0; block < blocks; block++) {
    const end = values.map((n: any, i: number) => f(n + steps[i])),
      inverse = 1 / end[0],
      endU = end[1] * inverse,
      endV = end[2] * inverse;
    commands.push({
      x: x + offset,
      y,
      count: delta,
      u: fixed(u),
      v: fixed(v),
      du: fixed(endU - u) >> Math.log2(delta),
      dv: fixed(endV - v) >> Math.log2(delta),
    });
    values = end;
    u = f(endU);
    v = f(endV);
    offset += delta;
  }
  const tail = count - offset;
  if (tail) {
    const endX = x + count - plane.origin[0],
      q = endX * plane.slopes[0][0] + rows[0],
      inverse = 1 / q;
    const endU = (endX * plane.slopes[1][0] + rows[1]) * inverse,
      endV = (endX * plane.slopes[2][0] + rows[2]) * inverse;
    commands.push({
      x: x + offset,
      y,
      count: tail,
      u: fixed(u),
      v: fixed(v),
      du: Math.trunc(fixed(endU - u) / tail),
      dv: Math.trunc(fixed(endV - v) / tail),
    });
  }
  return commands;
}
export function textureSpanTexels(commands: any, size: number[]) {
  const pixels = [];
  for (const c of commands) {
    for (let i = 0; i < c.count; i++) {
      // The native MMX writer increments before sampling the first pixel.
      const u = (c.u + Math.imul(c.du, i + 1)) | 0,
        v = (c.v + Math.imul(c.dv, i + 1)) | 0;
      pixels.push([(u >> 20) & (size[0] - 1), (v >> 20) & (size[1] - 1)]);
    }
  }
  return pixels;
}
function polygonEdge(a: number[], b: any[]) {
  const dy = b[1] - a[1],
    dx = b[0] - a[0],
    step = dy ? Math.floor(dx / dy) : 0,
    remainder = dx - step * dy;
  return {
    end: b[1],
    x: a[0] + step,
    step,
    remainder,
    error: 2 * remainder - dy,
    negativeStep: remainder - dy,
  };
}
function edgePixel(edge: {
  end?: any;
  x: any;
  step?: any;
  remainder?: any;
  error?: any;
  negativeStep?: any;
}) {
  const { x } = edge;
  if (edge.error >= 0) {
    edge.x += edge.step + 1;
    edge.error += edge.negativeStep;
  } else {
    edge.x += edge.step;
    edge.error += edge.remainder;
  }
  return x;
}
export function texturePolygonRows(vertices: number[][]) {
  const points: number[][] = [];
  for (const p of vertices) {
    const point = [magicInteger(f(p[0])), magicInteger(f(p[1]))],
      last = points.at(-1);
    if (!last || point[0] !== last[0] || point[1] !== last[1]) {
      points.push(point);
    }
  }
  if (
    points.length > 1 &&
    points[0][0] === points.at(-1)![0] &&
    points[0][1] === points.at(-1)![1]
  ) {
    points.pop();
  }
  if (points.length < 3) {
    return [];
  }
  let top = 0,
    bottom = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] < points[top][1]) {
      top = i;
    }
    if (points[i][1] > points[bottom][1]) {
      bottom = i;
    }
  }
  if (top === bottom) {
    return [];
  }
  const chain = (direction: number) => {
    const edges = [];
    for (let i = top; i !== bottom;) {
      const next = (i + direction + points.length) % points.length;
      edges.push(polygonEdge(points[i], points[next]));
      i = next;
    }
    return edges;
  };
  const a = chain(1),
    b = chain(-1),
    rows = [];
  let ai = 0,
    bi = 0;
  for (let y = points[top][1] + 1; y <= points[bottom][1]; y++) {
    while (ai < a.length - 1 && y > a[ai].end) {
      ai++;
    }
    while (bi < b.length - 1 && y > b[bi].end) {
      bi++;
    }
    const x0 = edgePixel(a[ai]),
      x1 = edgePixel(b[bi]);
    if (x0 !== x1) {
      rows.push({ x: Math.min(x0, x1), y, count: Math.abs(x1 - x0) });
    }
  }
  return rows;
}
export function polygonDepthSpan(
  plane: { origin: any; firstQ?: any; size?: any; values: any; slopes: any },
  row: { x: any; y: any; count: any },
  priorityBias = 0,
  retainRowPrecision = false,
) {
  const dy = row.y - plane.origin[1],
    rawBase = dy * plane.slopes[0][1] + plane.values[0],
    base = retainRowPrecision ? rawBase : f(rawBase),
    bias = f(priorityBias),
    dq = plane.slopes[0][0];
  const q = (x: number) => f(f((x - plane.origin[0]) * dq + base) + bias);
  return {
    x0: row.x,
    x1: row.x + row.count - 1,
    q0: q(row.x),
    q1: q(row.x + row.count - 1),
    dq,
  };
}
export function texturePolygonCommands(
  vertices: number[][],
  size: any[],
  options: {
    weightedUV?: boolean;
    delta?: number;
    spanBuffer?: import('./span-buffer.ts').SpanBuffer;
    priorityBias?: number;
  } = {},
) {
  const plane = prepareTexturePlane(vertices, size, options),
    commands = [];
  for (const row of texturePolygonRows(vertices)) {
    const visible = options.spanBuffer
      ? options.spanBuffer.insert(
          row.y,
          polygonDepthSpan(plane, row, options.priorityBias),
        )
      : null;
    if (visible) {
      for (const span of visible) {
        commands.push(
          ...textureSpanCommands(
            plane,
            { x: span.x0, y: row.y, count: span.x1 - span.x0 + 1 },
            options,
          ),
        );
      }
    } else {
      commands.push(...textureSpanCommands(plane, row, options));
    }
  }
  return commands;
}
export function drawIndexedTexturePolygon(
  target: { readonly length: number; [index: number]: number },
  stride: number,
  vertices: number[][],
  texture: { width: number; height: number; pixels: ArrayLike<number> },
  options = {},
) {
  const { width, height, pixels } = texture,
    commands = texturePolygonCommands(vertices, [width, height], options);
  for (const command of commands) {
    const start = command.y * stride + command.x;
    if (
      command.x < 0 ||
      command.x + command.count > stride ||
      command.y < 0 ||
      start + command.count > target.length
    ) {
      throw new RangeError('Projected polygon requires window clipping');
    }
    let { u } = command,
      { v } = command;
    for (let i = 0; i < command.count; i++) {
      u = (u + command.du) | 0;
      v = (v + command.dv) | 0;
      target[start + i] =
        pixels[((v >> 20) & (height - 1)) * width + ((u >> 20) & (width - 1))];
    }
  }
  return commands;
}
