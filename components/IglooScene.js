'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  mergeVertices,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';

function fadeNoise(value) {
  return value * value * (3 - 2 * value);
}

function hashNoise(x, y, z, seed) {
  const value = Math.sin(
    x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19,
  ) * 43758.5453123;
  return (value - Math.floor(value)) * 2 - 1;
}

function valueNoise3(x, y, z, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fadeNoise(x - x0);
  const ty = fadeNoise(y - y0);
  const tz = fadeNoise(z - z0);

  const sample = (dx, dy, dz) =>
    hashNoise(x0 + dx, y0 + dy, z0 + dz, seed);
  const x00 = THREE.MathUtils.lerp(sample(0, 0, 0), sample(1, 0, 0), tx);
  const x10 = THREE.MathUtils.lerp(sample(0, 1, 0), sample(1, 1, 0), tx);
  const x01 = THREE.MathUtils.lerp(sample(0, 0, 1), sample(1, 0, 1), tx);
  const x11 = THREE.MathUtils.lerp(sample(0, 1, 1), sample(1, 1, 1), tx);
  const yA = THREE.MathUtils.lerp(x00, x10, ty);
  const yB = THREE.MathUtils.lerp(x01, x11, ty);
  return THREE.MathUtils.lerp(yA, yB, tz);
}

function fractalNoise3(x, y, z, seed) {
  let value = 0;
  let amplitude = 0.58;
  let frequency = 1;
  let amplitudeSum = 0;

  for (let octave = 0; octave < 4; octave += 1) {
    value +=
      valueNoise3(
        x * frequency,
        y * frequency,
        z * frequency,
        seed + octave * 17,
      ) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return value / amplitudeSum;
}

function triangularFacetNoise2(x, y, seed) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = x - cellX;
  const localY = y - cellY;
  const height00 = hashNoise(cellX, cellY, 5, seed);
  const height10 = hashNoise(cellX + 1, cellY, 5, seed);
  const height01 = hashNoise(cellX, cellY + 1, 5, seed);
  const height11 = hashNoise(cellX + 1, cellY + 1, 5, seed);
  const descendingDiagonal = hashNoise(cellX, cellY, 13, seed + 11) > 0;

  if (descendingDiagonal) {
    if (localY <= localX) {
      return (
        height00 * (1 - localX) +
        height10 * (localX - localY) +
        height11 * localY
      );
    }

    return (
      height00 * (1 - localY) +
      height11 * localX +
      height01 * (localY - localX)
    );
  }

  if (localX + localY <= 1) {
    return (
      height00 * (1 - localX - localY) +
      height10 * localX +
      height01 * localY
    );
  }

  return (
    height11 * (localX + localY - 1) +
    height01 * (1 - localX) +
    height10 * (1 - localY)
  );
}

function cellularCrust2(x, y, seed) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let nearest = Infinity;
  let secondNearest = Infinity;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const candidateX = cellX + offsetX;
      const candidateY = cellY + offsetY;
      const pointX =
        candidateX + (hashNoise(candidateX, candidateY, 3, seed) + 1) * 0.5;
      const pointY =
        candidateY + (hashNoise(candidateX, candidateY, 9, seed + 7) + 1) * 0.5;
      const deltaX = pointX - x;
      const deltaY = pointY - y;
      const distance = deltaX * deltaX + deltaY * deltaY;

      if (distance < nearest) {
        secondNearest = nearest;
        nearest = distance;
      } else if (distance < secondNearest) {
        secondNearest = distance;
      }
    }
  }

  const cellInterior = THREE.MathUtils.smoothstep(
    Math.sqrt(secondNearest) - Math.sqrt(nearest),
    0.025,
    0.2,
  );
  const softenedCenter = 1 - THREE.MathUtils.smoothstep(Math.sqrt(nearest), 0.08, 0.7);
  return cellInterior * (0.72 + softenedCenter * 0.28);
}

function cellularFracture2(x, y, seed) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let nearest = Infinity;
  let secondNearest = Infinity;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const candidateX = cellX + offsetX;
      const candidateY = cellY + offsetY;
      const pointX =
        candidateX + (hashNoise(candidateX, candidateY, 3, seed) + 1) * 0.5;
      const pointY =
        candidateY + (hashNoise(candidateX, candidateY, 9, seed + 7) + 1) * 0.5;
      const deltaX = pointX - x;
      const deltaY = pointY - y;
      const distance = deltaX * deltaX + deltaY * deltaY;

      if (distance < nearest) {
        secondNearest = nearest;
        nearest = distance;
      } else if (distance < secondNearest) {
        secondNearest = distance;
      }
    }
  }

  const distanceToBoundary = Math.sqrt(secondNearest) - Math.sqrt(nearest);
  return 1 - THREE.MathUtils.smoothstep(distanceToBoundary, 0.012, 0.065);
}

const ROCK_TEXTURE_RECIPES = Object.freeze([
  {
    name: 'split-slab',
    base: [0.009, 1.15, 0.42, 0.2],
    micro: 0.007,
    colorVariation: 0.045,
    plates: [
      { x: -0.28, y: 0.18, rx: 0.58, ry: 0.46, angle: -0.22, height: 0.044, edge: 0.24, slopeX: -0.14, slopeY: 0.08 },
      { x: 0.46, y: -0.3, rx: 0.46, ry: 0.36, angle: 0.34, height: -0.026, edge: 0.3, slopeX: 0.08, slopeY: 0.12 },
    ],
    cuts: [
      { angle: -0.58, offset: 0.02, width: 0.026, length: 0.82, height: -0.022 },
      { angle: 0.9, offset: -0.36, width: 0.018, length: 0.34, height: -0.012 },
    ],
  },
  {
    name: 'pitted-stone',
    base: [0.007, 0.8, 1.2, 1.1],
    micro: 0.008,
    colorVariation: 0.05,
    plates: [
      { x: -0.48, y: 0.2, rx: 0.3, ry: 0.26, angle: 0.18, height: -0.034, edge: 0.34, slopeX: 0.04, slopeY: -0.08 },
      { x: 0.16, y: -0.28, rx: 0.34, ry: 0.3, angle: -0.38, height: -0.029, edge: 0.3, slopeX: -0.06, slopeY: 0.1 },
      { x: 0.52, y: 0.32, rx: 0.27, ry: 0.22, angle: 0.48, height: -0.023, edge: 0.34, slopeX: 0.08, slopeY: 0.02 },
      { x: -0.02, y: 0.1, rx: 0.55, ry: 0.42, angle: -0.12, height: 0.018, edge: 0.22, slopeX: 0.1, slopeY: -0.04 },
    ],
    cuts: [
      { angle: 0.28, offset: 0.44, width: 0.02, length: 0.46, height: -0.013 },
    ],
  },
  {
    name: 'wind-striated',
    base: [0.01, 1.4, 0.28, -0.35],
    micro: 0.006,
    colorVariation: 0.04,
    plates: [
      { x: 0.08, y: 0.04, rx: 0.78, ry: 0.5, angle: -0.08, height: 0.021, edge: 0.26, slopeX: -0.12, slopeY: 0.04 },
    ],
    cuts: [
      { angle: -0.82, offset: -0.38, width: 0.035, length: 0.72, height: 0.02 },
      { angle: -0.82, offset: -0.08, width: 0.024, length: 0.88, height: -0.018 },
      { angle: -0.82, offset: 0.22, width: 0.032, length: 0.66, height: 0.017 },
      { angle: -0.82, offset: 0.48, width: 0.02, length: 0.42, height: -0.012 },
    ],
  },
  {
    name: 'broken-plateau',
    base: [0.008, 0.62, 1.05, 0.64],
    micro: 0.007,
    colorVariation: 0.048,
    plates: [
      { x: -0.14, y: 0.04, rx: 0.66, ry: 0.48, angle: 0.2, height: 0.052, edge: 0.18, slopeX: 0.14, slopeY: -0.1 },
      { x: 0.54, y: -0.34, rx: 0.34, ry: 0.3, angle: -0.42, height: 0.026, edge: 0.22, slopeX: -0.1, slopeY: 0.08 },
      { x: -0.62, y: -0.38, rx: 0.3, ry: 0.25, angle: 0.52, height: -0.024, edge: 0.3, slopeX: 0.02, slopeY: 0.08 },
    ],
    cuts: [
      { angle: 0.52, offset: -0.04, width: 0.028, length: 0.92, height: -0.027 },
      { angle: -0.46, offset: 0.25, width: 0.018, length: 0.45, height: -0.015 },
    ],
  },
  {
    name: 'quiet-weathered',
    base: [0.008, 0.72, 0.58, -0.18],
    micro: 0.005,
    colorVariation: 0.032,
    plates: [
      { x: -0.08, y: 0.02, rx: 0.82, ry: 0.62, angle: -0.14, height: 0.022, edge: 0.34, slopeX: -0.08, slopeY: 0.07 },
      { x: 0.44, y: -0.28, rx: 0.28, ry: 0.24, angle: 0.28, height: -0.014, edge: 0.36, slopeX: 0.04, slopeY: 0.06 },
      { x: -0.5, y: 0.34, rx: 0.25, ry: 0.21, angle: -0.34, height: -0.011, edge: 0.38, slopeX: -0.04, slopeY: 0.02 },
    ],
    cuts: [],
  },
  {
    name: 'crag-cluster',
    base: [0.009, 1.06, 0.88, 0.38],
    micro: 0.009,
    colorVariation: 0.055,
    plates: [
      { x: -0.42, y: 0.28, rx: 0.36, ry: 0.3, angle: 0.38, height: 0.047, edge: 0.16, slopeX: 0.16, slopeY: -0.12 },
      { x: 0.02, y: 0.06, rx: 0.38, ry: 0.34, angle: -0.28, height: -0.03, edge: 0.22, slopeX: -0.08, slopeY: 0.14 },
      { x: 0.44, y: -0.2, rx: 0.42, ry: 0.32, angle: 0.18, height: 0.041, edge: 0.18, slopeX: -0.14, slopeY: 0.06 },
      { x: -0.22, y: -0.48, rx: 0.3, ry: 0.24, angle: -0.48, height: 0.026, edge: 0.2, slopeX: 0.1, slopeY: 0.1 },
    ],
    cuts: [
      { angle: -0.2, offset: 0.08, width: 0.025, length: 0.86, height: -0.024 },
      { angle: 0.92, offset: -0.22, width: 0.018, length: 0.48, height: -0.015 },
    ],
  },
]);

const ROCK_TEXTURE_SEQUENCE = Object.freeze([
  0, 4, 2, 1, 5, 3, 4, 0, 2, 5, 1, 4, 3, 0, 5, 2, 4, 1, 3, 5, 0, 4, 2,
]);

function evaluateRockPlate(x, y, plate) {
  const cosine = Math.cos(plate.angle);
  const sine = Math.sin(plate.angle);
  const deltaX = x - plate.x;
  const deltaY = y - plate.y;
  const localX = (deltaX * cosine + deltaY * sine) / plate.rx;
  const localY = (-deltaX * sine + deltaY * cosine) / plate.ry;
  const polygonDistance = Math.max(
    Math.abs(localX),
    Math.abs(localY),
    Math.abs(localX * 0.58 + localY * 0.82) * 0.76,
  );
  // Keep the plate boundaries tight so their definition comes from the mesh
  // silhouette and face normals rather than a painted edge.
  const transitionWidth = plate.edge * 0.2;
  const plateau =
    1 - THREE.MathUtils.smoothstep(polygonDistance, 1 - transitionWidth, 1);
  const faceSlope = 1 + localX * plate.slopeX + localY * plate.slopeY;
  return plate.height * plateau * faceSlope;
}

function evaluateRockCut(x, y, cut) {
  const cosine = Math.cos(cut.angle);
  const sine = Math.sin(cut.angle);
  const along = x * cosine + y * sine;
  const across = -x * sine + y * cosine - cut.offset;
  const lengthMask =
    1 - THREE.MathUtils.smoothstep(Math.abs(along), cut.length * 0.72, cut.length);
  const widthMask =
    1 - THREE.MathUtils.smoothstep(Math.abs(across), cut.width, cut.width * 2.6);
  return cut.height * lengthMask * widthMask;
}

function getRockTextureAssignment(seed) {
  const ordinal = Math.abs(Math.round(seed / 29));
  return {
    noiseSeed: seed + ordinal * 37,
    rotation: -0.58 + hashNoise(ordinal, 7, 19, seed) * 0.34,
    phaseX: hashNoise(ordinal, 11, 3, seed + 17) * 1.7,
    phaseY: hashNoise(ordinal, 5, 23, seed + 29) * 1.7,
  };
}

function evaluateRockTexture(assignment, x, y) {
  const cosine = Math.cos(assignment.rotation);
  const sine = Math.sin(assignment.rotation);
  const rotatedX = x * cosine - y * sine;
  const rotatedY = x * sine + y * cosine;
  const warpX =
    fractalNoise3(x * 1.25, y * 1.25, 0.37, assignment.noiseSeed + 41) * 0.11;
  const warpY =
    fractalNoise3(x * 1.1, y * 1.1, 0.83, assignment.noiseSeed + 59) * 0.08;
  const sampleX = rotatedX + warpX + assignment.phaseX;
  const sampleY = rotatedY + warpY + assignment.phaseY;

  // A continuous hierarchy of piecewise-planar fields creates the fractured
  // slab itself. There are no bounded decals or repeated raised motifs.
  let relief =
    triangularFacetNoise2(
      sampleX * 1.15,
      sampleY * 1.15,
      assignment.noiseSeed + 101,
    ) * 0.021;
  relief +=
    triangularFacetNoise2(
      sampleX * 2.75,
      sampleY * 2.75,
      assignment.noiseSeed + 149,
    ) * 0.008;
  relief +=
    triangularFacetNoise2(
      sampleX * 6.4,
      sampleY * 6.4,
      assignment.noiseSeed + 181,
    ) * 0.0024;

  // Fine stratified grooves run through the larger planes instead of sitting
  // inside a rectangular patch.
  const striationWarp =
    fractalNoise3(x * 2.4, y * 2.4, 1.17, assignment.noiseSeed + 211) * 0.22;
  const striationPhase =
    (rotatedY * 7.2 + striationWarp + assignment.phaseY * 0.6) * Math.PI;
  const striationDistance = Math.abs(Math.sin(striationPhase));
  const striation =
    1 - THREE.MathUtils.smoothstep(striationDistance, 0.015, 0.19);
  const striationMask = THREE.MathUtils.smoothstep(
    fractalNoise3(x * 1.7, y * 1.7, 1.91, assignment.noiseSeed + 239),
    -0.35,
    0.45,
  );
  relief -= striation * striationMask * 0.0024;

  const fractureNetwork = cellularFracture2(
    (sampleX + 2.7) * 3.25,
    (sampleY - 1.9) * 3.25,
    assignment.noiseSeed + 271,
  );
  relief -= fractureNetwork * 0.00155;
  relief +=
    fractalNoise3(
      sampleX * 8.5,
      sampleY * 8.5,
      assignment.noiseSeed * 0.007,
      assignment.noiseSeed + 307,
    ) * 0.00135;
  return relief;
}

const ARCTIC_PALETTE = Object.freeze({
  snowLight: new THREE.Color(0xeaf2f2),
  snowMid: new THREE.Color(0xcbdde1),
  snowShade: new THREE.Color(0xaebfc6),
  iceEdge: new THREE.Color(0xc6d8dc),
  mountainRock: new THREE.Color(0x155f82),
  mountainShade: new THREE.Color(0x4f849a),
  mountainSnow: new THREE.Color(0xe1ecee),
});

function pushTriangle(positions, colors, pointA, pointB, pointC, color) {
  [pointA, pointB, pointC].forEach((point) => {
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
  });
}

function makeFlatGeometry(positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createArcticRidgeGeometry({
  centerX,
  centerZ,
  width,
  depth,
  peaks,
  glaciers = [],
  baseY = -0.42,
  seed,
  layerTint = 0,
  foothillSnowBlend = 0,
  foothillIrregularity = 0,
  widthSegments = 40,
  depthSegments = 9,
}) {
  const points = [];
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const ridgeDepth = depth * 0.15;
  // These axes follow the camera's horizon, turning a small height field into
  // a broad continuous range rather than a collection of radial cones.
  const tangentX = 0.824;
  const tangentZ = -0.566;
  const awayX = -0.566;
  const awayZ = -0.824;
  const maxPeakHeight = Math.max(...peaks.map((peak) => peak.height));

  function ridgeHeight(u) {
    let height = 0;
    peaks.forEach((peak) => {
      const distance = Math.abs((u - peak.u) / peak.width);
      const peakShape = Math.pow(
        Math.max(0, 1 - distance),
        peak.sharpness ?? 0.68,
      );
      height = Math.max(height, peak.height * peakShape);
    });

    const edgeTaper =
      1 - THREE.MathUtils.smoothstep(Math.abs(u), halfWidth * 0.82, halfWidth);
    const crag =
      fractalNoise3(u * 0.105, seed * 0.013, 0.4, seed + 37) * 0.28 +
      triangularFacetNoise2(u * 0.16, seed * 0.031, seed + 61) * 0.13 +
      fractalNoise3(u * 0.46, seed * 0.027, 1.7, seed + 73) * 0.15;
    return Math.max(0, height + crag) * edgeTaper;
  }

  for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
    const v = THREE.MathUtils.lerp(
      -halfDepth,
      halfDepth,
      depthIndex / depthSegments,
    );
    const rowFrontProgress = THREE.MathUtils.clamp(
      (v + halfDepth) / (ridgeDepth + halfDepth),
      0,
      1,
    );
    const row = [];

    for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
      const u = THREE.MathUtils.lerp(
        -halfWidth,
        halfWidth,
        widthIndex / widthSegments,
      );
      // The mountain's toe advances and recedes in broad, overlapping lobes.
      // Warping both its footprint and rate of ascent prevents the foreground
      // snow from meeting the range along a synthetic ruler-straight edge.
      const foothillShape = THREE.MathUtils.clamp(
        Math.sin(u * 0.071 + seed * 0.017) * 0.38 +
          fractalNoise3(u * 0.039, seed * 0.021, 2.4, seed + 43) * 0.62,
        -1,
        1,
      );
      const frontEdgeWeight =
        1 - THREE.MathUtils.smoothstep(rowFrontProgress, 0.02, 0.7);
      const localV =
        v + foothillShape * foothillIrregularity * frontEdgeWeight;
      const frontProgress = THREE.MathUtils.clamp(
        rowFrontProgress * (0.88 + foothillShape * 0.24),
        0,
        1,
      );
      const crossSection =
        v <= ridgeDepth
          ? Math.pow(THREE.MathUtils.smoothstep(frontProgress, 0, 1), 0.72)
          : Math.pow(
              THREE.MathUtils.clamp(
                1 - (v - ridgeDepth) / (halfDepth - ridgeDepth),
                0,
                1,
              ),
              0.58,
            );
      let height = ridgeHeight(u) * crossSection;

      glaciers.forEach((glacier) => {
        const acrossGlacier = (u - glacier.u) / glacier.width;
        const glacierChannel = Math.exp(-acrossGlacier * acrossGlacier * 2.2);
        const verticalChannel = Math.sin(frontProgress * Math.PI) ** 2;
        height -= glacierChannel * verticalChannel * glacier.depth;
      });

      const surfaceNoise =
        fractalNoise3(u * 0.12, localV * 0.16, seed * 0.01, seed + 89) *
        (0.06 + crossSection * 0.16);
      const erosionDetail =
        (fractalNoise3(u * 0.48, localV * 0.58, seed * 0.023, seed + 127) *
          0.11 +
          triangularFacetNoise2(u * 0.31, localV * 0.39, seed + 167) *
            0.065 +
          fractalNoise3(
            u * 1.05,
            localV * 1.18,
            seed * 0.041,
            seed + 181,
          ) *
            0.025) *
        crossSection;
      const foothillRoll =
        (1 - crossSection) *
        THREE.MathUtils.smoothstep(frontProgress, 0.08, 0.72) *
        (0.13 + Math.max(0, Math.sin(u * 0.34 + seed)) * 0.18);
      height = Math.max(
        0,
        height + surfaceNoise + erosionDetail + foothillRoll,
      );

      row.push(
        new THREE.Vector3(
          centerX + tangentX * u + awayX * localV,
          baseY + height,
          centerZ + tangentZ * u + awayZ * localV,
        ),
      );
    }
    points.push(row);
  }

  const positions = [];
  points.forEach((row) => {
    row.forEach((point) => positions.push(point.x, point.y, point.z));
  });
  const indices = [];
  const rowLength = widthSegments + 1;

  for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
    for (let widthIndex = 0; widthIndex < widthSegments; widthIndex += 1) {
      const point00 = depthIndex * rowLength + widthIndex;
      const point10 = point00 + 1;
      const point01 = point00 + rowLength;
      const point11 = point01 + 1;
      const descendingDiagonal =
        hashNoise(widthIndex, depthIndex, seed, seed + 149) > 0;

      if (descendingDiagonal) {
        indices.push(point00, point10, point11, point00, point11, point01);
      } else {
        indices.push(point00, point10, point01, point10, point11, point01);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const normalAttribute = geometry.getAttribute('normal');
  const positionAttribute = geometry.getAttribute('position');
  const colors = [];
  const vertexNormal = new THREE.Vector3();
  const vertexColor = new THREE.Color();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    const x = positionAttribute.getX(index);
    const y = positionAttribute.getY(index);
    const z = positionAttribute.getZ(index);
    vertexNormal.fromBufferAttribute(normalAttribute, index);
    const upwardness = Math.abs(vertexNormal.y);
    const altitude = THREE.MathUtils.clamp((y - baseY) / maxPeakHeight, 0, 1);
    const localDepth =
      (x - centerX) * awayX + (z - centerZ) * awayZ;
    const colorFrontProgress = THREE.MathUtils.clamp(
      (localDepth + halfDepth) / (ridgeDepth + halfDepth),
      0,
      1,
    );
    const snowfieldMerge =
      foothillSnowBlend *
      (1 - THREE.MathUtils.smoothstep(colorFrontProgress, 0.06, 0.72));
    const granularNoise =
      fractalNoise3(x * 0.33, y * 0.58, z * 0.33, seed + 211) * 0.24;
    const rockStrata =
      Math.sin(y * 22 + x * 0.31 + granularNoise * 8) * 0.11;
    const snowCoverage = THREE.MathUtils.clamp(
      THREE.MathUtils.smoothstep(upwardness, 0.5, 0.9) * 0.62 +
        THREE.MathUtils.smoothstep(altitude, 0.54, 0.94) * 0.18 +
        granularNoise * 0.38 -
        Math.max(0, rockStrata) * 1.18,
      0.02,
      1,
    );
    const rockLight = THREE.MathUtils.clamp(
      vertexNormal.x * 0.25 + granularNoise * 0.8 + 0.5,
      0,
      1,
    );
    const rock = ARCTIC_PALETTE.mountainRock
      .clone()
      .lerp(ARCTIC_PALETTE.mountainShade, rockLight);
    const snow = ARCTIC_PALETTE.snowMid
      .clone()
      .lerp(
        ARCTIC_PALETTE.mountainSnow,
        THREE.MathUtils.clamp(upwardness * 0.7 + altitude * 0.28, 0, 1),
      );
    vertexColor
      .copy(rock)
      .lerp(snow, snowCoverage)
      .lerp(ARCTIC_PALETTE.snowLight, layerTint)
      .lerp(ARCTIC_PALETTE.snowMid, snowfieldMerge)
      .offsetHSL(0, 0, granularNoise * 0.08);
    colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function evaluateIglooSiteHeight(x, z, edgeProgress = 0) {
  const centerY = -0.055;
  const gaussian = (centerX, centerZ, spreadX, spreadZ, height) => {
    const dx = (x - centerX) / spreadX;
    const dz = (z - centerZ) / spreadZ;
    return Math.exp(-(dx * dx + dz * dz) * 1.35) * height;
  };

  // Large overlapping banks create a sheltered basin instead of a flat disc.
  const banks =
    gaussian(-5.3, -2.5, 3.1, 2.45, 1.08) +
    gaussian(-6.5, 3.4, 2.5, 3.1, 0.82) +
    gaussian(5.7, -3.4, 3.5, 2.35, 0.98) +
    gaussian(7.1, 2.25, 2.45, 3.2, 0.86) +
    gaussian(-0.6, -7.1, 4.2, 2.3, 0.76) +
    gaussian(1.6, 7.8, 4.8, 2.25, 0.54);
  const shallowGullies =
    gaussian(-2.4, -3.6, 1.25, 3.8, -0.2) +
    gaussian(4.2, 2.8, 1.35, 3.4, -0.16);
  const broadRelief =
    fractalNoise3(x * 0.1, 0.73, z * 0.1, 719) * 0.19 +
    fractalNoise3(x * 0.245, 1.31, z * 0.245, 751) * 0.075;
  const windCut =
    Math.pow(
      Math.max(
        0,
        Math.sin(
          x * 0.68 +
            z * 0.18 +
            fractalNoise3(x * 0.12, z * 0.12, 0.5, 773) * 1.45,
        ),
      ),
      10,
    ) * 0.055;

  const padDistance = Math.hypot(x - 0.4, z - 1.1);
  const terrainMask = THREE.MathUtils.smoothstep(padDistance, 3.55, 5.35);
  const platformFalloff = THREE.MathUtils.smoothstep(padDistance, 3.7, 8.6);
  const platformHeight = THREE.MathUtils.lerp(centerY, -0.335, platformFalloff);
  let height =
    platformHeight +
    (banks + shallowGullies + broadRelief + windCut) * terrainMask;

  // Feather the irregular shelf into the distant snow at its outer boundary.
  const edgeBlend = Math.pow(
    THREE.MathUtils.smoothstep(edgeProgress, 0.82, 1),
    1.3,
  );
  height = THREE.MathUtils.lerp(height, -0.405, edgeBlend);
  return height;
}

function createSnowSiteGeometry(radius = 11.8, rings = 30, segments = 160) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const boundary = [];
  const centerY = evaluateIglooSiteHeight(0, 0, 0);

  positions.push(0, centerY, 0);
  uvs.push(0, 0);
  colors.push(
    ARCTIC_PALETTE.snowLight.r,
    ARCTIC_PALETTE.snowLight.g,
    ARCTIC_PALETTE.snowLight.b,
  );

  for (let ring = 1; ring <= rings; ring += 1) {
    const progress = ring / rings;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const edgeVariation =
        1 +
        Math.sin(angle * 3 + 0.7) * 0.055 +
        Math.sin(angle * 7 - 0.4) * 0.026 +
        hashNoise(segment, 6, 2, 941) * 0.018 * progress;
      const localRadius = radius * progress * edgeVariation;
      const x = Math.cos(angle) * localRadius * 1.14;
      const z = Math.sin(angle) * localRadius * 0.94;
      const y = evaluateIglooSiteHeight(x, z, progress);
      const granularVariation =
        (fractalNoise3(x * 0.34, 1.2, z * 0.34, 809) + 1) * 0.045;
      const lowArea = THREE.MathUtils.clamp((0.18 - y) * 0.22, 0, 0.12);
      const vertexColor = ARCTIC_PALETTE.snowLight
        .clone()
        .lerp(
          ARCTIC_PALETTE.snowMid,
          0.065 + progress * 0.12 + granularVariation * 0.72 + lowArea * 0.6,
        );

      positions.push(x, y, z);
      uvs.push(x / 18, z / 18);
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);

      if (ring === rings) boundary.push(new THREE.Vector3(x, y, z));
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + ((segment + 1) % segments), 1 + segment);
  }

  for (let ring = 1; ring < rings; ring += 1) {
    const innerStart = 1 + (ring - 1) * segments;
    const outerStart = innerStart + segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(
        innerStart + segment,
        innerStart + next,
        outerStart + segment,
      );
      indices.push(innerStart + next, outerStart + next, outerStart + segment);
    }
  }

  const indexedTop = new THREE.BufferGeometry();
  indexedTop.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  indexedTop.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  indexedTop.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  indexedTop.setIndex(indices);
  // Keep the radial grid indexed. Shared vertices produce continuous snow
  // normals and use roughly a third of the memory of the old triangle soup.
  const top = indexedTop;
  top.computeVertexNormals();
  top.computeBoundingSphere();

  const sidePositions = [];
  const sideColors = [];
  const sideUvs = [];
  const sideIndices = [];
  boundary.forEach((topPoint, segment) => {
    const bottomPoint = new THREE.Vector3(
      topPoint.x * 1.035,
      -0.425 + hashNoise(segment, 2, 5, 1013) * 0.01,
      topPoint.z * 1.035,
    );
    const topColor = ARCTIC_PALETTE.iceEdge
      .clone()
      .lerp(
        ARCTIC_PALETTE.snowShade,
        0.12 +
          (fractalNoise3(
            topPoint.x * 0.16,
            1.7,
            topPoint.z * 0.16,
            1039,
          ) +
            1) *
            0.055,
      );
    const bottomColor = topColor.clone().offsetHSL(0.006, 0.01, -0.075);

    sidePositions.push(
      topPoint.x,
      topPoint.y,
      topPoint.z,
      bottomPoint.x,
      bottomPoint.y,
      bottomPoint.z,
    );
    sideColors.push(
      topColor.r,
      topColor.g,
      topColor.b,
      bottomColor.r,
      bottomColor.g,
      bottomColor.b,
    );
    const u = segment / boundary.length;
    sideUvs.push(u, 0, u, 1);
  });

  boundary.forEach((_, segment) => {
    const next = (segment + 1) % boundary.length;
    const topIndex = segment * 2;
    const bottomIndex = topIndex + 1;
    const nextTopIndex = next * 2;
    const nextBottomIndex = nextTopIndex + 1;
    sideIndices.push(
      topIndex,
      bottomIndex,
      nextTopIndex,
      nextTopIndex,
      bottomIndex,
      nextBottomIndex,
    );
  });

  const sides = new THREE.BufferGeometry();
  sides.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(sidePositions, 3),
  );
  sides.setAttribute('color', new THREE.Float32BufferAttribute(sideColors, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(sideUvs, 2));
  sides.setIndex(sideIndices);
  sides.computeVertexNormals();
  sides.computeBoundingSphere();

  return { top, sides };
}

function boulderVertexKey(point) {
  return `${Math.round(point.x * 100000)},${Math.round(point.y * 100000)},${Math.round(point.z * 100000)}`;
}

function createSnowBoulderGeometries(seed, detail = 8) {
  // The relatively dense tessellation is intentional: the large fractured
  // planes define the form, while smaller chips keep the silhouette crisp at
  // close range. Creased normals preserve those planes without exposing every
  // subdivision triangle.
  const rock = new THREE.IcosahedronGeometry(1, detail);
  const positions = rock.getAttribute('position');
  const leanX = hashNoise(seed, 3, 11, seed + 29) * 0.055;
  const leanZ = hashNoise(seed, 7, 17, seed + 47) * 0.045;

  for (let index = 0; index < positions.count; index += 1) {
    const sourceX = positions.getX(index);
    const sourceY = positions.getY(index);
    const sourceZ = positions.getZ(index);
    const sourceLength = Math.hypot(sourceX, sourceY, sourceZ) || 1;
    const directionX = sourceX / sourceLength;
    const directionY = sourceY / sourceLength;
    const directionZ = sourceZ / sourceLength;

    const majorPlane = triangularFacetNoise2(
      directionX * 1.55 + directionY * 0.48,
      directionZ * 1.55 - directionY * 0.32,
      seed,
    );
    const brokenPlane = triangularFacetNoise2(
      directionX * 3.6 - directionY * 0.72,
      directionZ * 3.6 + directionY * 0.54,
      seed + 71,
    );
    const chips = triangularFacetNoise2(
      directionX * 8.8 + directionY * 1.7,
      directionZ * 8.8 - directionY * 1.1,
      seed + 127,
    );
    const fracture = cellularFracture2(
      (directionX + directionY * 0.23) * 5.1,
      (directionZ - directionY * 0.19) * 5.1,
      seed + 181,
    );
    const weathering = fractalNoise3(
      directionX * 11.5,
      directionY * 8.5,
      directionZ * 11.5,
      seed + 233,
    );
    const strataPhase =
      directionY * 17 +
      majorPlane * 1.8 +
      fractalNoise3(
        directionX * 2.3,
        directionY * 2.3,
        directionZ * 2.3,
        seed + 269,
      ) *
        1.4;
    const strataCut = Math.pow(Math.max(0, Math.cos(strataPhase)), 16);
    const fracturedRadius =
      1 +
      majorPlane * 0.12 +
      brokenPlane * 0.046 +
      chips * 0.015 +
      weathering * 0.011 -
      fracture * 0.026 -
      strataCut * 0.023;

    let displacedX = directionX * fracturedRadius;
    let displacedY = directionY * fracturedRadius;
    let displacedZ = directionZ * fracturedRadius;

    // Wind-worn arctic outcrops tend to break into broad upper slabs instead
    // of retaining a round boulder crown. This plateau is still noisy enough
    // to collect snow in shallow pockets.
    const plateauMask = THREE.MathUtils.smoothstep(directionY, 0.26, 0.78) * 0.72;
    const plateauHeight =
      0.73 +
      triangularFacetNoise2(
        directionX * 2.25,
        directionZ * 2.25,
        seed + 317,
      ) *
        0.055 +
      fractalNoise3(
        directionX * 6.2,
        1.1,
        directionZ * 6.2,
        seed + 353,
      ) *
        0.018;
    displacedY = THREE.MathUtils.lerp(
      displacedY,
      plateauHeight,
      plateauMask,
    );
    displacedX += displacedY * leanX;
    displacedZ += displacedY * leanZ;

    positions.setXYZ(index, displacedX, displacedY, displacedZ);
  }
  positions.needsUpdate = true;

  const darkStone = new THREE.Color(0x767570);
  const midStone = new THREE.Color(0xaaa79f);
  const paleStone = new THREE.Color(0xd2cfc6);
  const faceColor = new THREE.Color();
  const rockColors = new Float32Array(positions.count * 3);
  const pointA = new THREE.Vector3();
  const pointB = new THREE.Vector3();
  const pointC = new THREE.Vector3();
  const edgeAB = new THREE.Vector3();
  const edgeAC = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const faceCenter = new THREE.Vector3();

  // IcosahedronGeometry is non-indexed, so each triangle can carry a slightly
  // different mineral value without bleeding across a fracture edge.
  for (let index = 0; index < positions.count; index += 3) {
    pointA.fromBufferAttribute(positions, index);
    pointB.fromBufferAttribute(positions, index + 1);
    pointC.fromBufferAttribute(positions, index + 2);
    edgeAB.subVectors(pointB, pointA);
    edgeAC.subVectors(pointC, pointA);
    faceNormal.crossVectors(edgeAB, edgeAC).normalize();
    faceCenter.copy(pointA).add(pointB).add(pointC).multiplyScalar(1 / 3);

    const mineralNoise = fractalNoise3(
      faceCenter.x * 3.4,
      faceCenter.y * 4.8,
      faceCenter.z * 3.4,
      seed + 401,
    );
    const bedding =
      Math.sin(
        faceCenter.y * 27 +
          mineralNoise * 4.2 +
          faceCenter.x * 1.7,
      ) *
      0.5 +
      0.5;
    const lightness = THREE.MathUtils.clamp(
      0.39 +
        faceNormal.y * 0.2 +
        faceNormal.x * 0.08 +
        mineralNoise * 0.22 +
        bedding * 0.11,
      0,
      1,
    );
    const paleVein =
      1 -
      THREE.MathUtils.smoothstep(
        Math.abs(Math.sin(faceCenter.y * 34 + mineralNoise * 5.5)),
        0,
        0.075,
      );
    faceColor
      .copy(darkStone)
      .lerp(midStone, lightness)
      .lerp(paleStone, paleVein * 0.28);

    for (let corner = 0; corner < 3; corner += 1) {
      const colorIndex = (index + corner) * 3;
      rockColors[colorIndex] = faceColor.r;
      rockColors[colorIndex + 1] = faceColor.g;
      rockColors[colorIndex + 2] = faceColor.b;
    }
  }
  rock.setAttribute('color', new THREE.BufferAttribute(rockColors, 3));
  toCreasedNormals(rock, THREE.MathUtils.degToRad(19));
  rock.computeBoundingSphere();

  const capPositions = [];
  const capUvs = [];
  const capColors = [];
  const boundaryEdges = new Map();
  const snowLight = new THREE.Color(0xeaf2f2);
  const snowShade = new THREE.Color(0xb8cbd1);
  const snowColor = new THREE.Color();

  function registerBoundaryEdge(start, end) {
    const startKey = boulderVertexKey(start);
    const endKey = boulderVertexKey(end);
    const edgeKey =
      startKey < endKey
        ? `${startKey}|${endKey}`
        : `${endKey}|${startKey}`;
    if (boundaryEdges.has(edgeKey)) {
      boundaryEdges.delete(edgeKey);
    } else {
      boundaryEdges.set(edgeKey, {
        start: start.clone(),
        end: end.clone(),
      });
    }
  }

  function getSnowTopPoint(point) {
    const radial = point.clone().normalize();
    const powderNoise = fractalNoise3(
      point.x * 5.8,
      point.y * 5.8,
      point.z * 5.8,
      seed + 457,
    );
    return point
      .clone()
      .addScaledVector(radial, 0.027 + powderNoise * 0.007)
      .add(new THREE.Vector3(0, 0.052 + powderNoise * 0.011, 0));
  }

  function appendCapVertex(point, color, uvScale = 0.68) {
    capPositions.push(point.x, point.y, point.z);
    capUvs.push(point.x * uvScale + 0.5, point.z * uvScale + 0.5);
    capColors.push(color.r, color.g, color.b);
  }

  for (let index = 0; index < positions.count; index += 3) {
    pointA.fromBufferAttribute(positions, index);
    pointB.fromBufferAttribute(positions, index + 1);
    pointC.fromBufferAttribute(positions, index + 2);
    edgeAB.subVectors(pointB, pointA);
    edgeAC.subVectors(pointC, pointA);
    faceNormal.crossVectors(edgeAB, edgeAC).normalize();
    faceCenter.copy(pointA).add(pointB).add(pointC).multiplyScalar(1 / 3);

    const snowLineNoise =
      fractalNoise3(
        faceCenter.x * 2.15,
        faceCenter.y * 2.15,
        faceCenter.z * 2.15,
        seed + 503,
      ) *
        0.12 +
      triangularFacetNoise2(
        faceCenter.x * 1.8,
        faceCenter.z * 1.8,
        seed + 541,
      ) *
        0.055;
    const snowLine = 0.26 + snowLineNoise * 0.74;
    const slopeThreshold =
      0.28 +
      Math.max(
        0,
        fractalNoise3(
          faceCenter.x * 3.1,
          faceCenter.y * 3.1,
          faceCenter.z * 3.1,
          seed + 577,
        ),
      ) *
        0.14;
    const windScour = fractalNoise3(
      faceCenter.x * 1.65 - 0.7,
      faceCenter.y * 1.35,
      faceCenter.z * 1.65 + 0.4,
      seed + 613,
    );
    const exposedUpperPatch =
      faceCenter.y > 0.43 &&
      faceNormal.y < 0.86 &&
      windScour > 0.27;
    if (
      faceCenter.y <= snowLine ||
      faceNormal.y <= slopeThreshold ||
      exposedUpperPatch
    ) {
      continue;
    }

    const topA = getSnowTopPoint(pointA);
    const topB = getSnowTopPoint(pointB);
    const topC = getSnowTopPoint(pointC);
    const snowValue = THREE.MathUtils.clamp(
      0.5 + faceCenter.y * 0.32 + faceNormal.y * 0.19,
      0,
      1,
    );
    snowColor.copy(snowShade).lerp(snowLight, snowValue);
    appendCapVertex(topA, snowColor);
    appendCapVertex(topB, snowColor);
    appendCapVertex(topC, snowColor);
    registerBoundaryEdge(pointA, pointB);
    registerBoundaryEdge(pointB, pointC);
    registerBoundaryEdge(pointC, pointA);
  }

  // Give the separate cap genuine thickness. The irregular boundary walls are
  // what keep the snow from reading as a color mask painted onto the stone.
  const snowLipColor = new THREE.Color(0xa9bec6);
  boundaryEdges.forEach(({ start, end }) => {
    const topStart = getSnowTopPoint(start);
    const topEnd = getSnowTopPoint(end);
    const bottomStart = start.clone().addScaledVector(start.clone().normalize(), 0.004);
    const bottomEnd = end.clone().addScaledVector(end.clone().normalize(), 0.004);
    appendCapVertex(topStart, snowLipColor);
    appendCapVertex(bottomStart, snowLipColor);
    appendCapVertex(topEnd, snowLipColor);
    appendCapVertex(topEnd, snowLipColor);
    appendCapVertex(bottomStart, snowLipColor);
    appendCapVertex(bottomEnd, snowLipColor);
  });

  const snow = new THREE.BufferGeometry();
  snow.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(capPositions, 3),
  );
  snow.setAttribute('uv', new THREE.Float32BufferAttribute(capUvs, 2));
  snow.setAttribute('color', new THREE.Float32BufferAttribute(capColors, 3));
  toCreasedNormals(snow, THREE.MathUtils.degToRad(48));
  snow.computeBoundingSphere();

  return { rock, snow };
}

function createDistantSnowfieldGeometry(
  widthSegments = 256,
  depthSegments = 144,
) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const tangentX = 0.824;
  const tangentZ = -0.566;
  const awayX = -0.566;
  const awayZ = -0.824;
  const centerX = -20;
  const centerZ = 0;
  const halfWidth = 120;
  const nearDepth = -90;
  const farDepth = 20;

  for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
    const depthProgress = depthIndex / depthSegments;
    const v = THREE.MathUtils.lerp(nearDepth, farDepth, depthProgress);
    const horizonFade = 1 - Math.pow(depthProgress, 5);

    for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
      const widthProgress = widthIndex / widthSegments;
      const u = THREE.MathUtils.lerp(-halfWidth, halfWidth, widthProgress);
      // A real snow basin never ends in a perfectly straight horizon. The
      // last quarter of the mesh pushes into the foothills in broad coves and
      // tongues, hiding the rectangular edge while retaining one continuous
      // textured snow surface.
      const horizonReach =
        Math.sin(u * 0.045 + 1.6) * 4.8 +
        Math.sin(u * 0.113 - 0.5) * 1.9 +
        fractalNoise3(u * 0.025, 1.7, 3.1, 1373) * 5.5;
      const farEdgeWarp = THREE.MathUtils.smoothstep(
        depthProgress,
        0.72,
        1,
      );
      const localV = v + horizonReach * farEdgeWarp;
      const broadDrift =
        fractalNoise3(u * 0.022, localV * 0.025, 0.7, 1201) * 0.11;
      const windRoll =
        Math.sin(
          u * 0.17 +
            localV * 0.052 +
            Math.sin(localV * 0.08) * 0.8,
        ) *
        0.022;
      const ridgePhase =
        u * 0.48 +
        localV * 0.105 +
        fractalNoise3(u * 0.035, localV * 0.035, 1.1, 1229) * 2.2;
      const windRidge =
        Math.pow(Math.max(0, Math.sin(ridgePhase)), 12) * 0.042;
      // The snow plain rises into broad banks before it reaches the mountain
      // meshes. Because this is the same textured 3D surface as the foreground,
      // it creates a continuous foothill transition instead of a hard seam.
      const mountainTransition = THREE.MathUtils.smoothstep(
        depthProgress,
        0.64,
        0.97,
      );
      const horizonBank =
        0.16 +
        (fractalNoise3(u * 0.028, localV * 0.018, 1.9, 1327) + 1) *
          0.15 +
        (Math.sin(u * 0.073 + 0.8) * 0.5 + 0.5) * 0.11;
      const y =
        -0.42 +
        (broadDrift + windRoll + windRidge) * horizonFade +
        horizonBank * mountainTransition;

      positions.push(
        centerX + tangentX * u + awayX * localV,
        y,
        centerZ + tangentZ * u + awayZ * localV,
      );
      // World-scaled UVs keep the snow grain the same physical size on the
      // vast plain and the smaller igloo site.
      uvs.push(u / 18, localV / 18);
    }
  }

  const rowLength = widthSegments + 1;
  for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
    for (let widthIndex = 0; widthIndex < widthSegments; widthIndex += 1) {
      const point00 = depthIndex * rowLength + widthIndex;
      const point10 = point00 + 1;
      const point01 = point00 + rowLength;
      const point11 = point01 + 1;
      if (hashNoise(widthIndex, depthIndex, 3, 1283) > 0) {
        indices.push(point00, point10, point11, point00, point11, point01);
      } else {
        indices.push(point00, point10, point01, point10, point11, point01);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSnowSurfaceTextures(renderer, size = 1024) {
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d', { alpha: false });
  const bumpContext = bumpCanvas.getContext('2d', { alpha: false });
  const colorData = colorContext.createImageData(size, size);
  const bumpData = bumpContext.createImageData(size, size);
  const colorPixels = colorData.data;
  const bumpPixels = bumpData.data;

  function grainHash(x, y) {
    let value = Math.imul(x + 173, 374761393) ^ Math.imul(y + 911, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function valueNoise(x, y, scale) {
    const gridX = Math.floor(x / scale);
    const gridY = Math.floor(y / scale);
    const tx = (x - gridX * scale) / scale;
    const ty = (y - gridY * scale) / scale;
    const smoothX = tx * tx * (3 - 2 * tx);
    const smoothY = ty * ty * (3 - 2 * ty);
    const top = THREE.MathUtils.lerp(
      grainHash(gridX, gridY),
      grainHash(gridX + 1, gridY),
      smoothX,
    );
    const bottom = THREE.MathUtils.lerp(
      grainHash(gridX, gridY + 1),
      grainHash(gridX + 1, gridY + 1),
      smoothX,
    );
    return THREE.MathUtils.lerp(top, bottom, smoothY) * 2 - 1;
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broadNoise =
        valueNoise(x, y, 180) * 0.52 +
        valueNoise(x + 71, y - 43, 74) * 0.31 +
        valueNoise(x - 19, y + 83, 31) * 0.17;
      const warp =
        valueNoise(x + 113, y - 57, 96) * 13 +
        Math.sin(y * 0.009) * 4.5;
      const ridgeWave = Math.sin(x * 0.092 + y * 0.021 + warp * 0.09);
      const ridge = Math.pow(Math.max(0, ridgeWave), 14);
      const hairline =
        Math.pow(
          Math.max(0, Math.sin(x * 0.215 + y * 0.047 + warp * 0.17)),
          22,
        ) * 0.48;
      const grain = grainHash(x, y) - 0.5;
      const pinGrain = grainHash(x * 3 + 17, y * 5 + 29) - 0.5;
      const height = THREE.MathUtils.clamp(
        0.47 +
          broadNoise * 0.19 +
          ridge * 0.29 +
          hairline * 0.16 +
          grain * 0.055,
        0,
        1,
      );
      const shade = THREE.MathUtils.clamp(
        225 + broadNoise * 9 + ridge * 8 + hairline * 3 + pinGrain * 2.4,
        0,
        255,
      );
      const index = (y * size + x) * 4;
      colorPixels[index] = shade - 8;
      colorPixels[index + 1] = shade - 2;
      colorPixels[index + 2] = Math.min(255, shade + 4);
      colorPixels[index + 3] = 255;
      const relief = height * 255;
      bumpPixels[index] = relief;
      bumpPixels[index + 1] = relief;
      bumpPixels[index + 2] = relief;
      bumpPixels[index + 3] = 255;
    }
  }
  colorContext.putImageData(colorData, 0, 0);
  bumpContext.putImageData(bumpData, 0, 0);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const color = new THREE.CanvasTexture(colorCanvas);
  color.name = 'ProceduralSnowColor';
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = THREE.MirroredRepeatWrapping;
  color.wrapT = THREE.MirroredRepeatWrapping;
  color.repeat.set(1, 1);
  color.anisotropy = maxAnisotropy;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.name = 'ProceduralSnowRelief';
  bump.wrapS = THREE.MirroredRepeatWrapping;
  bump.wrapT = THREE.MirroredRepeatWrapping;
  bump.repeat.copy(color.repeat);
  bump.anisotropy = maxAnisotropy;

  return { color, bump };
}

function createGroundSnow(isLowPower, rockMaterial, snowCapMaterial) {
  const snow = new THREE.Group();
  snow.name = 'GroundSnow';

  const flakeCanvas = document.createElement('canvas');
  flakeCanvas.width = 32;
  flakeCanvas.height = 32;
  const context = flakeCanvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.28, 'rgba(225, 242, 250, 0.7)');
  gradient.addColorStop(1, 'rgba(210, 235, 246, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);

  const flakeTexture = new THREE.CanvasTexture(flakeCanvas);
  flakeTexture.colorSpace = THREE.SRGBColorSpace;
  const count = isLowPower ? 110 : 240;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const seed = (index * 0.61803398875) % 1;
    const secondarySeed = (index * 0.41421356237) % 1;
    seeds[index] = seed;
    positions[index * 3] = (seed - 0.5) * 12;
    positions[index * 3 + 1] = 0.045 + secondarySeed * 0.2;
    positions[index * 3 + 2] = (secondarySeed - 0.5) * 12;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: flakeTexture,
    color: 0xddecf4,
    size: 0.075,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.48,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: true,
  });
  const powder = new THREE.Points(geometry, material);
  powder.name = 'WindSkimmingPowder';
  powder.frustumCulled = false;
  snow.add(powder);

  // These shapes sit close enough to the camera to read as individual rocks,
  // so each gets actual fractured geometry and an independent snow shell.
  // Keeping them as smooth instanced ellipsoids was the source of the soft,
  // plastic-looking stones in the foreground.
  const shelterRocks = new THREE.Group();
  shelterRocks.name = 'RuggedShelterRockField';
  const shelterRockCount = isLowPower ? 10 : 16;
  for (let index = 0; index < shelterRockCount; index += 1) {
    const angle = index * 2.399963 + hashNoise(index, 3, 11, 4127) * 0.28;
    const radius = 4.15 + ((index * 0.381966) % 1) * 2.7;
    const width = 0.52 + ((index * 0.754877) % 1) * 0.78;
    const depth = 0.4 + ((index * 0.56984) % 1) * 0.58;
    const height = 0.24 + ((index * 0.438447) % 1) * 0.22;
    const rockSeed = 4219 + index * 67;
    const geometries = createSnowBoulderGeometries(
      rockSeed,
      isLowPower ? 5 : 11,
    );
    const rock = new THREE.Group();
    rock.name = `ShelterRock-${String(index + 1).padStart(2, '0')}`;
    const exposedStone = new THREE.Mesh(geometries.rock, rockMaterial);
    exposedStone.name = `${rock.name}-ExposedStone`;
    exposedStone.castShadow = true;
    exposedStone.receiveShadow = true;
    const snowCap = new THREE.Mesh(geometries.snow, snowCapMaterial);
    snowCap.name = `${rock.name}-SnowCap`;
    snowCap.castShadow = true;
    snowCap.receiveShadow = true;
    snowCap.renderOrder = 1;
    rock.add(exposedStone, snowCap);
    rock.position.set(
      Math.cos(angle) * radius,
      0.015 - height * 0.12,
      Math.sin(angle) * radius,
    );
    rock.rotation.set(
      hashNoise(index, 5, 17, 4273) * 0.08,
      angle * 0.37 + hashNoise(index, 7, 23, 4303) * 0.22,
      hashNoise(index, 11, 29, 4337) * 0.07,
    );
    rock.scale.set(width, height, depth);
    shelterRocks.add(rock);
  }
  snow.add(shelterRocks);

  snow.userData.update = (elapsedSeconds, deltaSeconds) => {
    const positionAttribute = geometry.getAttribute('position');
    for (let index = 0; index < count; index += 1) {
      const seed = seeds[index];
      let x = positionAttribute.getX(index);
      let z = positionAttribute.getZ(index);
      x += deltaSeconds * (0.32 + seed * 0.52);
      z +=
        Math.sin(elapsedSeconds * (0.42 + seed * 0.35) + index * 1.7) *
        deltaSeconds *
        0.12;
      if (x > 6) {
        x = -6;
        z = (((index * 0.754877666) % 1) - 0.5) * 12;
      }
      positionAttribute.setXYZ(
        index,
        x,
        0.045 + ((index * 0.41421356237) % 1) * 0.18 +
          Math.sin(elapsedSeconds * 1.25 + index) * 0.025,
        z,
      );
    }
    positionAttribute.needsUpdate = true;
  };

  return snow;
}

function createFootprintTrail({
  sitePosition,
  iglooPosition,
  iglooRotationY,
  snowTextures,
}) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const footprintOrders = [];
  const indices = [];
  const ringSegments = 24;
  const ringScales = [0.3, 0.7, 1];
  const ringLift = [0.004, 0.01, 0.03];
  const stepZ = [
    8.13,
    7.66,
    7.19,
    6.72,
    6.25,
    5.78,
    5.31,
    4.84,
    4.37,
    3.9,
    3.43,
    2.96,
    2.49,
    2.02,
    1.55,
  ];
  const depressionColors = [
    new THREE.Color(0x587284),
    new THREE.Color(0x668091),
    new THREE.Color(0x93aab7),
    new THREE.Color(0xd4e3e9),
  ];
  const worldCos = Math.cos(iglooRotationY);
  const worldSin = Math.sin(iglooRotationY);

  let activeFootprintOrder = 0;
  const appendVertex = (localX, localZ, lift, color, uvX, uvY) => {
    const worldX =
      iglooPosition.x + worldCos * localX + worldSin * localZ;
    const worldZ =
      iglooPosition.z - worldSin * localX + worldCos * localZ;
    const siteX = worldX - sitePosition.x;
    const siteZ = worldZ - sitePosition.z;
    const edgeProgress = Math.hypot(
      siteX / (11.8 * 1.14),
      siteZ / (11.8 * 0.94),
    );
    const surfaceY = evaluateIglooSiteHeight(siteX, siteZ, edgeProgress);
    positions.push(siteX, surfaceY + lift, siteZ);
    colors.push(color.r, color.g, color.b, 0);
    uvs.push(uvX, uvY);
    footprintOrders.push(activeFootprintOrder);
  };

  stepZ.forEach((centerZ, stepIndex) => {
    activeFootprintOrder = stepIndex;
    const isLeft = stepIndex % 2 === 0;
    const centerX = isLeft ? -0.17 : 0.17;
    const toeAngle = isLeft ? -0.055 : 0.055;
    const toeCos = Math.cos(toeAngle);
    const toeSin = Math.sin(toeAngle);
    const baseIndex = positions.length / 3;

    // A subtly darker center surrounded by a raised snow lip reads as a
    // pressed-in boot track without transparent decals or extra draw calls.
    appendVertex(centerX, centerZ, 0.005, depressionColors[0], 0.5, 0.5);

    ringScales.forEach((ringScale, ringIndex) => {
      for (let segment = 0; segment < ringSegments; segment += 1) {
        const angle = (segment / ringSegments) * Math.PI * 2;
        const longitudinal = Math.cos(angle);
        const toeWeight = THREE.MathUtils.smoothstep(longitudinal, 0.05, 0.92);
        const heelWeight = THREE.MathUtils.smoothstep(-longitudinal, 0.22, 0.96);
        const widthProfile = 0.81 + toeWeight * 0.19 - heelWeight * 0.17;
        const soleX =
          Math.sin(angle) * 0.12 * widthProfile * ringScale;
        const soleZ = -longitudinal * 0.27 * ringScale;
        const turnedX = toeCos * soleX + toeSin * soleZ;
        const turnedZ = -toeSin * soleX + toeCos * soleZ;
        const treadShade =
          ringIndex < 2
            ? Math.sin((soleZ / 0.27 + 1) * Math.PI * 3.5) * 0.025
            : 0;
        const vertexColor = depressionColors[ringIndex + 1]
          .clone()
          .offsetHSL(0, 0, treadShade);
        appendVertex(
          centerX + turnedX,
          centerZ + turnedZ,
          ringLift[ringIndex],
          vertexColor,
          0.5 + soleX / 0.24,
          0.5 + soleZ / 0.54,
        );
      }
    });

    const firstRing = baseIndex + 1;
    for (let segment = 0; segment < ringSegments; segment += 1) {
      const next = (segment + 1) % ringSegments;
      indices.push(baseIndex, firstRing + next, firstRing + segment);
    }

    for (let ringIndex = 0; ringIndex < ringScales.length - 1; ringIndex += 1) {
      const innerStart = baseIndex + 1 + ringIndex * ringSegments;
      const outerStart = innerStart + ringSegments;
      for (let segment = 0; segment < ringSegments; segment += 1) {
        const next = (segment + 1) % ringSegments;
        indices.push(
          innerStart + segment,
          innerStart + next,
          outerStart + segment,
          innerStart + next,
          outerStart + next,
          outerStart + segment,
        );
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    bumpMap: snowTextures.bump,
    bumpScale: 0.035,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const trail = new THREE.Mesh(geometry, material);
  trail.name = 'FootprintsIntoEntrance';
  trail.castShadow = false;
  trail.receiveShadow = true;
  trail.renderOrder = 2;
  trail.userData.revealProgress = -1;
  trail.userData.stepCount = stepZ.length;
  trail.userData.setRevealProgress = (progress) => {
    const revealProgress = THREE.MathUtils.clamp(
      progress,
      0,
      stepZ.length,
    );
    if (Math.abs(revealProgress - trail.userData.revealProgress) < 0.002) {
      return;
    }
    trail.userData.revealProgress = revealProgress;
    const colorAttribute = geometry.getAttribute('color');
    for (let index = 0; index < colorAttribute.count; index += 1) {
      const order = footprintOrders[index];
      const alpha = THREE.MathUtils.smoothstep(
        revealProgress,
        order + 0.02,
        order + 0.34,
      );
      colorAttribute.setW(index, alpha);
    }
    colorAttribute.needsUpdate = true;
  };
  return trail;
}

function createInteriorBench(isLowPower) {
  const bench = new THREE.Group();
  bench.name = 'InteriorBench';
  bench.position.set(-1.62, 0, 0.55);

  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b2117,
    roughness: 0.96,
    metalness: 0,
    emissive: 0x2a0e05,
    emissiveIntensity: 0.16,
  });
  const hideMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c755b,
    roughness: 1,
    metalness: 0,
    emissive: 0x301309,
    emissiveIntensity: 0.1,
  });

  const addPart = (geometry, material, name, position) => {
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.position.copy(position);
    part.castShadow = true;
    part.receiveShadow = true;
    bench.add(part);
    return part;
  };

  addPart(
    new THREE.BoxGeometry(0.42, 0.12, 1.58, 2, 1, isLowPower ? 3 : 5),
    woodMaterial,
    'BenchSeat',
    new THREE.Vector3(0, 0.43, 0),
  );
  const cushion = addPart(
    new THREE.CapsuleGeometry(0.2, 1.12, 4, isLowPower ? 8 : 12),
    hideMaterial,
    'BenchHideCushion',
    new THREE.Vector3(0.02, 0.52, 0),
  );
  cushion.rotation.x = Math.PI * 0.5;
  cushion.scale.set(1, 1, 0.35);

  [-0.58, 0.58].forEach((z, index) => {
    addPart(
      new THREE.BoxGeometry(0.16, 0.42, 0.16),
      woodMaterial,
      `BenchLeg-${index + 1}`,
      new THREE.Vector3(0, 0.21, z),
    );
  });
  addPart(
    new THREE.BoxGeometry(0.12, 0.7, 1.58, 1, 3, isLowPower ? 3 : 5),
    woodMaterial,
    'BenchBack',
    new THREE.Vector3(-0.22, 0.77, 0),
  );

  return bench;
}

function createArcticWalker(isLowPower) {
  const walker = new THREE.Group();
  walker.name = 'ArcticTraveler';

  const figure = new THREE.Group();
  figure.name = 'ArticulatedFigure';
  walker.add(figure);

  const radialSegments = isLowPower ? 8 : 12;
  const parkaMaterial = new THREE.MeshStandardMaterial({
    color: 0x8e4131,
    roughness: 0.92,
    metalness: 0,
  });
  const parkaShadeMaterial = new THREE.MeshStandardMaterial({
    color: 0x652f2a,
    roughness: 0.94,
    metalness: 0,
  });
  const furMaterial = new THREE.MeshStandardMaterial({
    color: 0xb59a79,
    roughness: 1,
    metalness: 0,
  });
  const trouserMaterial = new THREE.MeshStandardMaterial({
    color: 0x263b49,
    roughness: 0.96,
    metalness: 0,
  });
  const bootMaterial = new THREE.MeshStandardMaterial({
    color: 0x302725,
    roughness: 1,
    metalness: 0,
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0x9a674e,
    roughness: 0.9,
    metalness: 0,
  });

  const addClothingMesh = (parent, geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const torso = new THREE.Group();
  torso.name = 'Torso';
  figure.add(torso);

  const coat = addClothingMesh(
    torso,
    new THREE.CylinderGeometry(
      0.255,
      0.35,
      0.62,
      radialSegments,
      3,
    ),
    parkaMaterial,
    'FurLinedParka',
  );
  coat.position.y = 1.05;

  const hem = addClothingMesh(
    torso,
    new THREE.TorusGeometry(0.335, 0.035, 5, radialSegments),
    furMaterial,
    'ParkaHem',
  );
  hem.position.y = 0.755;
  hem.rotation.x = Math.PI * 0.5;

  const chestTrim = addClothingMesh(
    torso,
    new THREE.BoxGeometry(0.055, 0.48, 0.018),
    furMaterial,
    'ParkaFrontTrim',
  );
  chestTrim.position.set(0, 1.08, -0.278);

  const hoodShell = addClothingMesh(
    torso,
    new THREE.SphereGeometry(0.235, radialSegments, radialSegments),
    parkaShadeMaterial,
    'ParkaHood',
  );
  hoodShell.position.set(0, 1.47, 0.015);
  hoodShell.scale.set(1, 1.06, 0.92);

  const face = addClothingMesh(
    torso,
    new THREE.SphereGeometry(0.15, radialSegments, radialSegments),
    skinMaterial,
    'Face',
  );
  face.position.set(0, 1.47, -0.105);
  face.scale.set(0.9, 1.04, 0.62);

  const hoodTrim = addClothingMesh(
    torso,
    new THREE.TorusGeometry(0.17, 0.048, 6, radialSegments),
    furMaterial,
    'FurHoodTrim',
  );
  hoodTrim.position.set(0, 1.47, -0.205);

  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'LeftShoulder' : 'RightShoulder';
    shoulder.position.set(side * 0.285, 1.27, 0);
    shoulder.rotation.z = side * -0.12;
    torso.add(shoulder);

    const upperArm = addClothingMesh(
      shoulder,
      new THREE.CylinderGeometry(
        0.095,
        0.105,
        0.33,
        radialSegments,
        2,
      ),
      parkaMaterial,
      `${side < 0 ? 'Left' : 'Right'}UpperArm`,
    );
    upperArm.position.y = -0.165;

    const cuff = new THREE.Group();
    cuff.name = `${side < 0 ? 'Left' : 'Right'}Elbow`;
    cuff.position.y = -0.32;
    shoulder.add(cuff);

    const forearm = addClothingMesh(
      cuff,
      new THREE.CylinderGeometry(
        0.078,
        0.09,
        0.27,
        radialSegments,
        2,
      ),
      parkaShadeMaterial,
      `${side < 0 ? 'Left' : 'Right'}Forearm`,
    );
    forearm.position.y = -0.135;

    const furCuff = addClothingMesh(
      cuff,
      new THREE.TorusGeometry(0.086, 0.022, 5, radialSegments),
      furMaterial,
      `${side < 0 ? 'Left' : 'Right'}FurCuff`,
    );
    furCuff.position.y = -0.265;
    furCuff.rotation.x = Math.PI * 0.5;

    const mitten = addClothingMesh(
      cuff,
      new THREE.SphereGeometry(0.09, radialSegments, radialSegments),
      parkaShadeMaterial,
      `${side < 0 ? 'Left' : 'Right'}Mitten`,
    );
    mitten.position.set(0, -0.31, -0.018);
    mitten.scale.set(0.86, 1.08, 0.9);
    return { shoulder, elbow: cuff };
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.name = side < 0 ? 'LeftHip' : 'RightHip';
    hip.position.set(side * 0.145, 0.75, 0);
    figure.add(hip);

    const thigh = addClothingMesh(
      hip,
      new THREE.CylinderGeometry(
        0.105,
        0.12,
        0.37,
        radialSegments,
        2,
      ),
      trouserMaterial,
      `${side < 0 ? 'Left' : 'Right'}Thigh`,
    );
    thigh.position.y = -0.185;

    const knee = new THREE.Group();
    knee.name = `${side < 0 ? 'Left' : 'Right'}Knee`;
    knee.position.y = -0.365;
    hip.add(knee);

    const lowerLeg = addClothingMesh(
      knee,
      new THREE.CylinderGeometry(
        0.085,
        0.1,
        0.34,
        radialSegments,
        2,
      ),
      trouserMaterial,
      `${side < 0 ? 'Left' : 'Right'}LowerLeg`,
    );
    lowerLeg.position.y = -0.17;

    const boot = new THREE.Group();
    boot.name = `${side < 0 ? 'Left' : 'Right'}BootPivot`;
    boot.position.y = -0.335;
    knee.add(boot);

    const bootMesh = addClothingMesh(
      boot,
      new THREE.CapsuleGeometry(0.088, 0.155, 4, radialSegments),
      bootMaterial,
      `${side < 0 ? 'Left' : 'Right'}Boot`,
    );
    bootMesh.position.set(0, -0.008, -0.052);
    bootMesh.rotation.x = Math.PI * 0.5;

    const sole = addClothingMesh(
      boot,
      new THREE.BoxGeometry(0.175, 0.035, 0.285, 2, 1, 3),
      bootMaterial,
      `${side < 0 ? 'Left' : 'Right'}BootSole`,
    );
    sole.position.set(0, -0.103, -0.05);
    return { hip, knee, boot };
  };

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, isLowPower ? 12 : 20),
    new THREE.MeshBasicMaterial({
      color: 0x142b3a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  contactShadow.name = 'TravelerContactShadow';
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.y = 0.012;
  contactShadow.scale.set(0.72, 1.35, 1);
  contactShadow.renderOrder = 1;
  walker.add(contactShadow);

  walker.userData.update = (
    elapsedSeconds,
    groundHeightAt,
    footprintTrail,
  ) => {
    const walkStart = 0.65;
    const straightEnd = 9;
    const turnEnd = 11.35;
    const sitStart = 11.6;
    const sitEnd = 13.25;
    walker.visible = true;

    const straightRaw = THREE.MathUtils.clamp(
      (elapsedSeconds - walkStart) / (straightEnd - walkStart),
      0,
      1,
    );
    const startRamp = 0.075;
    let straightProgress;
    if (straightRaw < startRamp) {
      straightProgress =
        (straightRaw * straightRaw) /
        (2 * startRamp * (1 - startRamp * 0.5));
    } else {
      straightProgress =
        (straightRaw - startRamp * 0.5) / (1 - startRamp * 0.5);
    }

    const turnRaw = THREE.MathUtils.clamp(
      (elapsedSeconds - straightEnd) / (turnEnd - straightEnd),
      0,
      1,
    );
    const turnProgress =
      turnRaw * turnRaw * (3 - 2 * turnRaw);
    const straightDistance = 6.75;
    const interiorDistance = 1.61;
    const pathDistance =
      straightProgress * straightDistance + turnProgress * interiorDistance;
    const stepProgress = pathDistance / 0.47;
    const gaitPhase = stepProgress * Math.PI;
    const startBlend = THREE.MathUtils.smoothstep(
      elapsedSeconds,
      walkStart,
      walkStart + 0.48,
    );
    const stopBlend =
      1 - THREE.MathUtils.smoothstep(turnRaw, 0.78, 1);
    const gaitAmount = startBlend * stopBlend;
    const strideWave = Math.sin(gaitPhase) * gaitAmount;
    const contactWave = Math.cos(gaitPhase) * gaitAmount;
    const bodyBob = Math.pow(Math.sin(gaitPhase), 2) * 0.052 * gaitAmount;
    const weightShift = -contactWave * 0.028;
    const turnHeading =
      turnProgress * turnProgress * (3 - 2 * turnProgress);
    let localX = THREE.MathUtils.lerp(0, -1.24, turnProgress);
    let localZ = THREE.MathUtils.lerp(
      8.4 - straightDistance * straightProgress,
      0.62,
      turnProgress,
    );
    const pathRotation = THREE.MathUtils.lerp(
      0,
      -Math.PI * 0.5,
      turnHeading,
    );

    const lateralX = weightShift * Math.cos(pathRotation);
    const lateralZ = -weightShift * Math.sin(pathRotation);
    localX += lateralX;
    localZ += lateralZ;
    walker.position.set(localX, groundHeightAt(localX, localZ) + 0.01, localZ);
    walker.rotation.y = pathRotation;
    figure.position.y = bodyBob;
    figure.rotation.z = contactWave * 0.018;
    torso.rotation.set(
      -0.045 + bodyBob * 0.24,
      -strideWave * 0.048,
      -contactWave * 0.01,
    );
    const headTurn =
      Math.sin(gaitPhase * 0.5) * 0.035 * gaitAmount + strideWave * 0.018;
    hoodShell.rotation.y = headTurn;
    face.rotation.y = headTurn;
    hoodTrim.rotation.y = headTurn;

    const updatePlantedLeg = (leg, phase) => {
      const wrappedPhase = ((phase % 1) + 1) % 1;
      const stanceEnd = 0.58;
      let footZ;
      let footLift = 0;
      let bootPitch = 0;
      if (wrappedPhase < stanceEnd) {
        const stanceProgress = wrappedPhase / stanceEnd;
        footZ = THREE.MathUtils.lerp(-0.27, 0.27, stanceProgress);
        bootPitch = THREE.MathUtils.lerp(-0.035, 0.05, stanceProgress);
      } else {
        const swingProgress =
          (wrappedPhase - stanceEnd) / (1 - stanceEnd);
        const smoothSwing =
          swingProgress * swingProgress * (3 - 2 * swingProgress);
        footZ = THREE.MathUtils.lerp(0.27, -0.27, smoothSwing);
        footLift = Math.sin(swingProgress * Math.PI) * 0.105;
        bootPitch = Math.sin(swingProgress * Math.PI) * -0.065;
      }

      footLift *= gaitAmount;
      bootPitch *= gaitAmount;
      const upperLength = 0.365;
      const lowerLength = 0.335;
      const hipHeight = leg.hip.position.y;
      const ankleHeight = 0.105 - bodyBob + footLift;
      const downwardDistance = hipHeight - ankleHeight;
      const reach = THREE.MathUtils.clamp(
        Math.hypot(downwardDistance, footZ),
        Math.abs(upperLength - lowerLength) + 0.001,
        upperLength + lowerLength - 0.001,
      );
      const targetAngle = Math.atan2(-footZ, downwardDistance);
      const hipOffset = Math.acos(
        THREE.MathUtils.clamp(
          (upperLength * upperLength + reach * reach - lowerLength * lowerLength) /
            (2 * upperLength * reach),
          -1,
          1,
        ),
      );
      const kneeBend =
        Math.PI -
        Math.acos(
          THREE.MathUtils.clamp(
            (upperLength * upperLength + lowerLength * lowerLength - reach * reach) /
              (2 * upperLength * lowerLength),
            -1,
            1,
          ),
        );
      // The traveler faces local -Z. A human knee therefore flexes around
      // negative local X: the knee travels forward while the heel folds back.
      // Using the opposite IK branch was what produced the backward joint.
      leg.hip.rotation.x = targetAngle + hipOffset;
      leg.knee.rotation.x = -kneeBend;
      leg.boot.rotation.x =
        -(leg.hip.rotation.x - kneeBend) + bootPitch;
    };

    const leftCycle = (stepProgress * 0.5) % 1;
    const rightCycle = (stepProgress * 0.5 + 0.5) % 1;
    updatePlantedLeg(leftLeg, leftCycle);
    updatePlantedLeg(rightLeg, rightCycle);

    leftArm.shoulder.rotation.x = -strideWave * 0.31;
    rightArm.shoulder.rotation.x = strideWave * 0.31;
    // Elbows use the same facing convention: positive local X keeps the
    // forearms naturally in front of the torso instead of folding backward.
    leftArm.elbow.rotation.x =
      0.24 + Math.max(0, strideWave) * 0.11;
    rightArm.elbow.rotation.x =
      0.24 + Math.max(0, -strideWave) * 0.11;
    contactShadow.material.opacity = 0.22 - bodyBob * 1.3;

    const revealProgress =
      elapsedSeconds >= walkStart
        ? Math.min(stepProgress, footprintTrail.userData.stepCount)
        : 0;
    footprintTrail.userData.setRevealProgress(revealProgress);

    const sitRaw = THREE.MathUtils.clamp(
      (elapsedSeconds - sitStart) / (sitEnd - sitStart),
      0,
      1,
    );
    if (sitRaw > 0) {
      const sitProgress = sitRaw * sitRaw * (3 - 2 * sitRaw);
      localX = THREE.MathUtils.lerp(localX, -1.5, sitProgress);
      localZ = THREE.MathUtils.lerp(localZ, 0.55, sitProgress);
      walker.position.set(
        localX,
        groundHeightAt(localX, localZ) + 0.01,
        localZ,
      );
      walker.rotation.y = -Math.PI * 0.5;
      figure.position.y = THREE.MathUtils.lerp(
        bodyBob,
        -0.115,
        sitProgress,
      );
      figure.rotation.z *= 1 - sitProgress;
      torso.rotation.x =
        THREE.MathUtils.lerp(torso.rotation.x, -0.02, sitProgress) -
        Math.sin(sitProgress * Math.PI) * 0.12;
      torso.rotation.y *= 1 - sitProgress;
      torso.rotation.z *= 1 - sitProgress;

      [leftLeg, rightLeg].forEach((leg) => {
        leg.hip.rotation.x = THREE.MathUtils.lerp(
          leg.hip.rotation.x,
          1.19,
          sitProgress,
        );
        leg.knee.rotation.x = THREE.MathUtils.lerp(
          leg.knee.rotation.x,
          -1.19,
          sitProgress,
        );
        leg.boot.rotation.x = THREE.MathUtils.lerp(
          leg.boot.rotation.x,
          0,
          sitProgress,
        );
      });
      [leftArm, rightArm].forEach((arm) => {
        arm.shoulder.rotation.x = THREE.MathUtils.lerp(
          arm.shoulder.rotation.x,
          0.2,
          sitProgress,
        );
        arm.elbow.rotation.x = THREE.MathUtils.lerp(
          arm.elbow.rotation.x,
          0.52,
          sitProgress,
        );
      });
      contactShadow.material.opacity = THREE.MathUtils.lerp(
        contactShadow.material.opacity,
        0,
        sitProgress,
      );
    }
  };

  return walker;
}

function createIglooFire() {
  const fire = new THREE.Group();
  fire.name = 'CentralFire';

  const barkMaterial = new THREE.MeshStandardMaterial({
    color: 0x24100a,
    roughness: 0.96,
    metalness: 0,
    emissive: 0x4a0900,
    emissiveIntensity: 0.42,
  });
  const charMaterial = new THREE.MeshStandardMaterial({
    color: 0x100806,
    roughness: 1,
    metalness: 0,
    emissive: 0xc71900,
    emissiveIntensity: 1.15,
  });

  const logGeometry = new THREE.CylinderGeometry(0.115, 0.14, 1.32, 14, 5);
  const charGeometry = new THREE.CylinderGeometry(0.122, 0.147, 0.46, 14, 1, true);
  [Math.PI * 0.25, -Math.PI * 0.25].forEach((angle, index) => {
    const log = new THREE.Mesh(logGeometry, barkMaterial);
    log.name = `Firewood-${index + 1}`;
    log.position.y = 0.19;
    log.rotation.set(0, angle, Math.PI * 0.5);
    log.castShadow = true;
    log.receiveShadow = true;
    fire.add(log);

    const char = new THREE.Mesh(charGeometry, charMaterial);
    char.position.copy(log.position);
    char.rotation.copy(log.rotation);
    fire.add(char);
  });

  const coalGeometry = new THREE.IcosahedronGeometry(0.105, 1);
  const coals = [];
  for (let index = 0; index < 11; index += 1) {
    const angle = index * 2.39996;
    const radius = 0.12 + (index % 4) * 0.085;
    const coal = new THREE.Mesh(coalGeometry, charMaterial);
    coal.position.set(
      Math.cos(angle) * radius,
      0.11 + (index % 3) * 0.026,
      Math.sin(angle) * radius,
    );
    coal.scale.set(0.72 + (index % 2) * 0.35, 0.42, 0.72);
    coal.rotation.set(angle * 0.31, angle, angle * 0.17);
    fire.add(coal);
    coals.push(coal);
  }

  const flameVertexShader = `
    uniform float uTime;
    uniform float uPhase;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 transformed = position;
      float lift = uv.y * uv.y;
      transformed.x +=
        sin(uTime * 5.1 + uv.y * 8.0 + uPhase) * 0.075 * lift;
      transformed.x +=
        sin(uTime * 8.7 - uv.y * 13.0 + uPhase * 1.7) * 0.025 * lift;
      transformed.y += sin(uTime * 6.2 + uPhase) * 0.025 * uv.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `;
  const flameFragmentShader = `
    uniform float uTime;
    uniform float uPhase;
    uniform float uOpacity;
    uniform vec3 uOuterColor;
    varying vec2 vUv;

    float hash(vec2 point) {
      point = fract(point * vec2(123.34, 456.21));
      point += dot(point, point + 45.32);
      return fract(point.x * point.y);
    }

    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), local.x),
        local.y
      );
    }

    float fbm(vec2 point) {
      float value = 0.0;
      float amplitude = 0.55;
      for (int octave = 0; octave < 5; octave++) {
        value += noise(point) * amplitude;
        point = point * 2.03 + vec2(17.1, 9.2);
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 point = vec2(vUv.x * 2.0 - 1.0, vUv.y);
      float time = uTime + uPhase * 0.37;
      vec2 flow = vec2(point.x * 2.25, point.y * 3.15 - time * 1.72);
      float broadNoise = fbm(flow);
      float fineNoise = fbm(flow * 1.9 + vec2(time * 0.31, -time * 0.48));
      float sway =
        sin(time * 4.2 + point.y * 7.5 + uPhase) * 0.105 * point.y +
        (broadNoise - 0.5) * 0.2 * point.y;
      float width = mix(0.63, 0.035, pow(point.y, 0.79));
      width *= 0.78 + broadNoise * 0.48;
      float mainBody = 1.0 - smoothstep(
        width * 0.3,
        width,
        abs(point.x - sway)
      );
      float forkMask = smoothstep(0.26, 0.52, point.y);
      float leftForkCenter = sway - 0.22 + sin(time * 5.7 + uPhase) * 0.045;
      float rightForkCenter = sway + 0.2 + sin(time * 4.9 + uPhase * 1.3) * 0.05;
      float forkWidth = mix(0.28, 0.018, pow(point.y, 0.72));
      float leftFork = 1.0 - smoothstep(
        forkWidth * 0.25,
        forkWidth,
        abs(point.x - leftForkCenter)
      );
      float rightFork = 1.0 - smoothstep(
        forkWidth * 0.25,
        forkWidth,
        abs(point.x - rightForkCenter)
      );
      float body = max(mainBody, max(leftFork, rightFork) * forkMask);
      float tornTop = 1.0 - smoothstep(
        0.69 + broadNoise * 0.2,
        1.01,
        point.y + (fineNoise - 0.5) * 0.12
      );
      float base = smoothstep(0.0, 0.075, point.y);
      float flame = body * tornTop * base;
      flame *= smoothstep(0.22, 0.68, broadNoise + body * 0.38);

      float heat = clamp(
        body * 1.25 + (1.0 - point.y) * 0.72 - fineNoise * 0.25,
        0.0,
        1.0
      );
      vec3 orange = mix(uOuterColor, vec3(1.0, 0.16, 0.008), heat);
      vec3 color = mix(orange, vec3(1.0, 0.58, 0.09), pow(heat, 3.6));
      float alpha = flame * mix(0.38, 0.82, heat) * uOpacity;
      if (alpha < 0.015) discard;
      gl_FragColor = vec4(color, alpha);
    }
  `;

  const flameUniforms = [];
  const flameGeometry = new THREE.PlaneGeometry(1.12, 1.58, 14, 24);
  [
    { rotation: 0.08, phase: 0.3, position: [-0.04, 0.85, 0], scale: [1.08, 1.04, 1], color: 0x8f0d00, opacity: 0.72 },
    { rotation: Math.PI * 0.5, phase: 1.4, position: [0.04, 0.79, -0.02], scale: [0.96, 0.93, 1], color: 0xc71900, opacity: 0.68 },
    { rotation: Math.PI / 3, phase: 2.4, position: [0.18, 0.7, 0.07], scale: [0.62, 0.78, 1], color: 0xee2f00, opacity: 0.76 },
    { rotation: -Math.PI / 3, phase: 4.1, position: [-0.18, 0.68, 0.02], scale: [0.58, 0.72, 1], color: 0xff4600, opacity: 0.74 },
    { rotation: -0.18, phase: 5.3, position: [0.02, 0.58, 0.14], scale: [0.46, 0.6, 1], color: 0xff6900, opacity: 0.82 },
  ].forEach((layer, index) => {
    const uniforms = {
      uTime: { value: 0 },
      uPhase: { value: layer.phase },
      uOpacity: { value: layer.opacity },
      uOuterColor: { value: new THREE.Color(layer.color) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: flameVertexShader,
      fragmentShader: flameFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: true,
    });
    const flame = new THREE.Mesh(flameGeometry, material);
    flame.name = `FlameLayer-${index + 1}`;
    flame.position.set(...layer.position);
    flame.rotation.y = layer.rotation;
    flame.scale.set(...layer.scale);
    flame.renderOrder = 8 + index;
    fire.add(flame);
    flameUniforms.push(uniforms);
  });

  const sparkCount = 26;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkSeeds = [];
  for (let index = 0; index < sparkCount; index += 1) {
    const seed = (index * 0.61803398875) % 1;
    sparkSeeds.push(seed);
    sparkPositions[index * 3] = (seed - 0.5) * 0.48;
    sparkPositions[index * 3 + 1] = 0.32 + ((index * 0.37) % 1) * 1.45;
    sparkPositions[index * 3 + 2] = (((index * 0.73) % 1) - 0.5) * 0.48;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(sparkPositions, 3),
  );
  const sparkMaterial = new THREE.PointsMaterial({
    color: 0xffb03a,
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.name = 'RisingEmbers';
  sparks.renderOrder = 12;
  fire.add(sparks);

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext('2d');
  const glowGradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  glowGradient.addColorStop(0, 'rgba(255, 244, 190, 1)');
  glowGradient.addColorStop(0.12, 'rgba(255, 174, 66, 0.88)');
  glowGradient.addColorStop(0.38, 'rgba(255, 74, 12, 0.34)');
  glowGradient.addColorStop(1, 'rgba(255, 32, 0, 0)');
  glowContext.fillStyle = glowGradient;
  glowContext.fillRect(0, 0, 128, 128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffa04a,
    transparent: true,
    opacity: 0.54,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const flameGlow = new THREE.Sprite(glowMaterial);
  flameGlow.name = 'FlameHalo';
  flameGlow.position.set(0, 0.82, 0);
  flameGlow.scale.set(3.25, 3.25, 1);
  flameGlow.renderOrder = 6;
  fire.add(flameGlow);

  const fireLight = new THREE.PointLight(0xff681f, 124, 12, 1.58);
  fireLight.name = 'FireGlow';
  fireLight.position.set(0, 0.72, 0);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.camera.near = 0.12;
  fireLight.shadow.camera.far = 12;
  fireLight.shadow.bias = -0.0015;
  fire.add(fireLight);

  const interiorLight = new THREE.PointLight(0xffa15a, 52, 9, 1.78);
  interiorLight.name = 'InteriorFireBounce';
  interiorLight.position.set(0, 1.38, -0.08);
  fire.add(interiorLight);

  const emberLight = new THREE.PointLight(0xff2b08, 25, 4.6, 1.9);
  emberLight.name = 'EmberGlow';
  emberLight.position.set(0, 0.2, 0);
  fire.add(emberLight);

  fire.userData.update = (elapsedSeconds, deltaSeconds) => {
    flameUniforms.forEach((uniforms) => {
      uniforms.uTime.value = elapsedSeconds;
    });

    const flicker =
      0.78 +
      Math.sin(elapsedSeconds * 12.7) * 0.09 +
      Math.sin(elapsedSeconds * 19.1 + 1.7) * 0.055 +
      Math.sin(elapsedSeconds * 5.3 + 0.4) * 0.075;
    const glowPulse =
      0.9 +
      Math.sin(elapsedSeconds * 2.15 - 0.4) * 0.1 +
      Math.sin(elapsedSeconds * 0.73 + 1.1) * 0.045;
    fire.userData.glowPulse = glowPulse;
    fireLight.intensity = 124 * flicker * glowPulse;
    fireLight.position.x = Math.sin(elapsedSeconds * 7.1) * 0.075;
    fireLight.position.z = Math.cos(elapsedSeconds * 5.9) * 0.06;
    interiorLight.intensity = (42 + flicker * 18) * glowPulse;
    interiorLight.position.x = Math.sin(elapsedSeconds * 2.9 + 0.7) * 0.045;
    interiorLight.position.z = -0.08 + Math.cos(elapsedSeconds * 3.4) * 0.035;
    emberLight.intensity = (20 + flicker * 7) * glowPulse;
    charMaterial.emissiveIntensity = (1.08 + flicker * 0.42) * glowPulse;
    const haloScale = 3.18 + glowPulse * 0.42 + flicker * 0.12;
    flameGlow.scale.set(haloScale, haloScale, 1);
    glowMaterial.opacity = 0.46 + glowPulse * 0.12 + flicker * 0.035;

    const positions = sparkGeometry.getAttribute('position');
    for (let index = 0; index < sparkCount; index += 1) {
      let y = positions.getY(index) + deltaSeconds * (0.34 + sparkSeeds[index] * 0.52);
      if (y > 1.92) y = 0.36 + sparkSeeds[index] * 0.18;
      const drift = elapsedSeconds * (1.4 + sparkSeeds[index]);
      positions.setXYZ(
        index,
        Math.sin(drift + index * 2.17) * (0.09 + y * 0.055),
        y,
        Math.cos(drift * 0.83 + index * 1.31) * (0.08 + y * 0.045),
      );
    }
    positions.needsUpdate = true;

    coals.forEach((coal, index) => {
      const pulse = 0.88 + Math.sin(elapsedSeconds * (3.2 + index * 0.11) + index) * 0.12;
      coal.scale.y = 0.42 * pulse;
    });
  };

  return fire;
}

export default function IglooScene({ onBlockCount, onReady }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const sceneHost = hostRef.current;
    if (!sceneHost) return undefined;
    const heroElement = sceneHost.parentElement;

    const deviceMemory = navigator.deviceMemory ?? 8;
    const hardwareThreads = navigator.hardwareConcurrency ?? 8;
    const isLowPower =
      deviceMemory <= 4 ||
      hardwareThreads <= 4 ||
      window.matchMedia('(max-width: 800px)').matches;
    const targetPixelRatio = Math.min(
      window.devicePixelRatio,
      isLowPower ? 1 : 1.35,
    );

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b1d2d, 0.0052);

    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(10.4, 6.7, 12.8);
    camera.lookAt(1.8, 2.25, 0.25);
    const cameraRestPosition = camera.position.clone();
    const cameraScrolledPosition = camera.position.clone();
    const cameraRestTarget = new THREE.Vector3(1.8, 2.25, 0.25);
    const cameraScrolledTarget = cameraRestTarget.clone();
    const cameraCurrentTarget = cameraRestTarget.clone();
    let cameraRestFov = camera.fov;
    let cameraScrolledFov = camera.fov;
    let viewProgress = 0;
    let viewProgressTarget = 0;
    const maximumViewProgress = 2;
    let hasFinishedModelConstruction = false;
    let haveExternalAssetsLoaded = false;
    let hasRenderedScene = false;
    let readyFrameId = null;
    let isDisposed = false;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(targetPixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.setClearColor(0x000000, 0);
    sceneHost.appendChild(renderer.domElement);

    // Keep the ambient level restrained so the relief is shaped by light
    // instead of being flattened into a uniformly white surface.
    const hemiLight = new THREE.HemisphereLight(0x779cb8, 0x07101a, 0.46);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xb9d8ee, 2.15);
    keyLight.position.set(-8.5, 10.5, 7.5);
    keyLight.target.position.set(1.4, 1.8, 0.25);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(isLowPower ? 1024 : 2048, isLowPower ? 1024 : 2048);
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.018;
    keyLight.shadow.autoUpdate = false;
    keyLight.shadow.needsUpdate = true;
    scene.add(keyLight, keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x76b7db, 1.15);
    rimLight.position.set(7.5, 5.5, -9);
    rimLight.target.position.set(1.3, 2.1, 0);
    scene.add(rimLight, rimLight.target);

    const fillLight = new THREE.DirectionalLight(0x4e7897, 0.22);
    fillLight.position.set(6, 2.5, 9);
    fillLight.target.position.set(1.5, 1.4, 1);
    scene.add(fillLight, fillLight.target);

    // Scenery part 1: lightweight procedural mountain layers. These are real
    // world-space meshes, so camera orbiting produces genuine parallax instead
    // of sliding a flat photograph behind the scene.
    const outskirts = new THREE.Group();
    outskirts.name = 'ArcticOutskirts';
    scene.add(outskirts);

    const ridgeLayers = [
      {
        name: 'FarGlacialRange',
        geometry: {
          centerX: -45,
          centerZ: -64,
          width: 284,
          depth: 30,
          baseY: -0.92,
          seed: 611,
          layerTint: 0.42,
          foothillSnowBlend: 0.12,
          foothillIrregularity: 2.4,
          peaks: [
            { u: -132, width: 24, height: 2.45, sharpness: 0.82 },
            { u: -103, width: 27, height: 3.15, sharpness: 0.76 },
            { u: -70, width: 29, height: 3.75, sharpness: 0.72 },
            { u: -36, width: 31, height: 4.35, sharpness: 0.67 },
            { u: 1, width: 29, height: 3.6, sharpness: 0.74 },
            { u: 37, width: 32, height: 4.55, sharpness: 0.66 },
            { u: 75, width: 29, height: 3.65, sharpness: 0.72 },
            { u: 108, width: 26, height: 3.0, sharpness: 0.78 },
            { u: 135, width: 20, height: 2.25, sharpness: 0.84 },
          ],
          glaciers: [
            { u: -52, width: 6.2, depth: 0.58 },
            { u: 18, width: 6.8, depth: 0.66 },
            { u: 88, width: 5.5, depth: 0.5 },
          ],
          widthSegments: isLowPower ? 78 : 160,
          depthSegments: isLowPower ? 9 : 14,
        },
      },
      {
        name: 'MiddleBrokenRange',
        geometry: {
          centerX: -31,
          centerZ: -49,
          width: 244,
          depth: 26,
          baseY: -0.84,
          seed: 947,
          layerTint: 0.24,
          foothillSnowBlend: 0.24,
          foothillIrregularity: 3.2,
          peaks: [
            { u: -113, width: 21, height: 1.9, sharpness: 0.86 },
            { u: -86, width: 25, height: 2.65, sharpness: 0.8 },
            { u: -56, width: 27, height: 3.35, sharpness: 0.74 },
            { u: -24, width: 28, height: 3.75, sharpness: 0.69 },
            { u: 10, width: 27, height: 3.15, sharpness: 0.76 },
            { u: 43, width: 29, height: 3.95, sharpness: 0.68 },
            { u: 77, width: 26, height: 3.05, sharpness: 0.76 },
            { u: 106, width: 21, height: 2.15, sharpness: 0.84 },
          ],
          glaciers: [
            { u: -39, width: 5.1, depth: 0.48 },
            { u: 28, width: 4.8, depth: 0.44 },
            { u: 84, width: 4.2, depth: 0.38 },
          ],
          widthSegments: isLowPower ? 68 : 140,
          depthSegments: isLowPower ? 8 : 13,
        },
      },
      {
        name: 'NearWindCarvedHills',
        geometry: {
          centerX: -18,
          centerZ: -35,
          width: 214,
          depth: 23,
          baseY: -0.76,
          seed: 1291,
          layerTint: 0.1,
          foothillSnowBlend: 0.7,
          foothillIrregularity: 5.2,
          peaks: [
            { u: -98, width: 20, height: 1.35, sharpness: 0.9 },
            { u: -74, width: 23, height: 1.85, sharpness: 0.86 },
            { u: -47, width: 25, height: 2.3, sharpness: 0.8 },
            { u: -18, width: 26, height: 2.65, sharpness: 0.75 },
            { u: 13, width: 25, height: 2.2, sharpness: 0.82 },
            { u: 42, width: 26, height: 2.8, sharpness: 0.74 },
            { u: 72, width: 23, height: 2.15, sharpness: 0.82 },
            { u: 99, width: 19, height: 1.45, sharpness: 0.9 },
          ],
          glaciers: [
            { u: -32, width: 4.2, depth: 0.34 },
            { u: 57, width: 3.8, depth: 0.3 },
          ],
          widthSegments: isLowPower ? 58 : 120,
          depthSegments: isLowPower ? 8 : 12,
        },
      },
    ];

    const ridgeMaterialColors = [0xc7d3d8, 0xa8bac2, 0xb0c2c8];
    ridgeLayers.forEach((layer, index) => {
      const ridge = new THREE.Mesh(
        createArcticRidgeGeometry(layer.geometry),
        new THREE.MeshStandardMaterial({
          color: ridgeMaterialColors[index],
          vertexColors: true,
          roughness: 1,
          metalness: 0,
          flatShading: index > 0,
        }),
      );
      ridge.name = layer.name;
      ridge.castShadow = false;
      ridge.receiveShadow = false;
      ridge.renderOrder = -30 + index;
      outskirts.add(ridge);
    });

    const snowSurfaceTextures = createSnowSurfaceTextures(
      renderer,
      isLowPower ? 512 : 1024,
    );
    const snowfieldGeometry = createDistantSnowfieldGeometry();
    const distantSnow = new THREE.Mesh(
      snowfieldGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x9eb8c9,
        map: snowSurfaceTextures.color,
        bumpMap: snowSurfaceTextures.bump,
        bumpScale: 0.075,
        roughness: 0.92,
        metalness: 0,
      }),
    );
    distantSnow.name = 'DistantSnowfield';
    distantSnow.receiveShadow = true;
    outskirts.add(distantSnow);

    // Scenery part 2: an irregular snow pad which physically grounds the
    // igloo. Its top and blending apron stay separate from the distant plain.
    const site = new THREE.Group();
    site.name = 'IglooSite';
    site.position.set(1.25, 0, -1.45);
    scene.add(site);

    const siteGeometry = createSnowSiteGeometry(11.8, 30, 160);
    const siteMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8ccd8,
      vertexColors: true,
      map: snowSurfaceTextures.color,
      bumpMap: snowSurfaceTextures.bump,
      bumpScale: 0.18,
      roughness: 0.93,
      metalness: 0,
      flatShading: false,
    });
    const siteTop = new THREE.Mesh(siteGeometry.top, siteMaterial);
    siteTop.name = 'SnowShelfTop';
    siteTop.castShadow = true;
    siteTop.receiveShadow = true;
    const siteEdge = new THREE.Mesh(
      siteGeometry.sides,
      new THREE.MeshStandardMaterial({
        color: 0xb8ccd8,
        vertexColors: true,
        map: snowSurfaceTextures.color,
        bumpMap: snowSurfaceTextures.bump,
        bumpScale: 0.075,
        roughness: 0.96,
        metalness: 0,
      }),
    );
    siteEdge.name = 'SnowShelfApron';
    siteEdge.receiveShadow = true;
    site.add(siteTop, siteEdge);

    const rockLoadingManager = new THREE.LoadingManager();
    rockLoadingManager.onLoad = () => {
      haveExternalAssetsLoaded = true;
      render();
    };
    const rockTextureLoader = new THREE.TextureLoader(rockLoadingManager);
    const rockColorTexture = rockTextureLoader.load(
      '/textures/faceted-slate-v2.png',
      render,
    );
    rockColorTexture.name = 'OutcropStoneColor';
    rockColorTexture.colorSpace = THREE.SRGBColorSpace;
    rockColorTexture.wrapS = THREE.MirroredRepeatWrapping;
    rockColorTexture.wrapT = THREE.MirroredRepeatWrapping;
    rockColorTexture.repeat.set(2.35, 1.65);
    rockColorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const rockReliefTexture = rockTextureLoader.load(
      '/textures/faceted-slate-v2.png',
      render,
    );
    rockReliefTexture.name = 'OutcropStoneRelief';
    rockReliefTexture.colorSpace = THREE.NoColorSpace;
    rockReliefTexture.wrapS = THREE.MirroredRepeatWrapping;
    rockReliefTexture.wrapT = THREE.MirroredRepeatWrapping;
    rockReliefTexture.repeat.copy(rockColorTexture.repeat);
    rockReliefTexture.anisotropy = rockColorTexture.anisotropy;

    const boulderRockMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: rockColorTexture,
      bumpMap: rockReliefTexture,
      bumpScale: 0.17,
      roughness: 0.9,
      metalness: 0,
      emissive: 0x20282b,
      emissiveIntensity: 0.2,
    });
    boulderRockMaterial.name = 'RuggedExposedStone';

    const boulderSnowMaterial = new THREE.MeshStandardMaterial({
      color: 0xf1f6f5,
      vertexColors: true,
      map: snowSurfaceTextures.color,
      bumpMap: snowSurfaceTextures.bump,
      bumpScale: 0.11,
      roughness: 0.97,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    boulderSnowMaterial.name = 'OutcropSnowAccumulation';
    const outcropLayout = [
      [-7.35, -3.05, 1.38, 0.52, 0.94, -0.24],
      [-8.25, 1.65, 1.06, 0.42, 0.76, 0.31],
      [-6.15, 5.25, 0.92, 0.38, 0.7, -0.52],
      [-3.35, -8.05, 1.18, 0.46, 0.82, 0.18],
      [0.8, -8.75, 0.78, 0.32, 0.58, -0.4],
      [5.75, -5.1, 1.34, 0.52, 0.92, 0.43],
      [8.15, -1.15, 1.04, 0.41, 0.74, -0.18],
      [7.75, 3.25, 1.16, 0.46, 0.8, 0.51],
      [5.1, 6.65, 0.86, 0.34, 0.62, -0.37],
      [2.65, 8.15, 0.96, 0.38, 0.68, 0.26],
      [-8.9, -0.65, 0.64, 0.28, 0.5, -0.12],
      [8.8, 0.95, 0.58, 0.25, 0.46, 0.44],
    ];
    outcropLayout.forEach(
      ([x, z, scaleX, scaleY, scaleZ, rotationY], index) => {
        const edgeProgress = Math.hypot(x / (11.8 * 1.14), z / (11.8 * 0.94));
        const terrainY = evaluateIglooSiteHeight(x, z, edgeProgress);
        const boulderSeed = 1709 + index * 53;
        const geometries = createSnowBoulderGeometries(
          boulderSeed,
          isLowPower ? 6 : 11,
        );
        const boulder = new THREE.Group();
        boulder.name = `SnowCappedOutcrop-${String(index + 1).padStart(2, '0')}`;
        const exposedStone = new THREE.Mesh(
          geometries.rock,
          boulderRockMaterial,
        );
        exposedStone.name = `${boulder.name}-ExposedStone`;
        exposedStone.castShadow = true;
        exposedStone.receiveShadow = true;
        const snowCap = new THREE.Mesh(
          geometries.snow,
          boulderSnowMaterial,
        );
        snowCap.name = `${boulder.name}-SnowCap`;
        snowCap.castShadow = true;
        snowCap.receiveShadow = true;
        snowCap.renderOrder = 1;
        boulder.add(exposedStone, snowCap);
        const ruggedScaleY = scaleY * 1.34;
        boulder.position.set(x, terrainY + ruggedScaleY * 0.015, z);
        boulder.rotation.set(
          hashNoise(index, 3, 7, 1787) * 0.14,
          rotationY,
          hashNoise(index, 5, 11, 1811) * 0.12,
        );
        boulder.scale.set(scaleX, ruggedScaleY, scaleZ);
        site.add(boulder);
      },
    );

    const igloo = new THREE.Group();
    igloo.name = 'Igloo';
    igloo.position.set(1.65, 0, -0.35);
    igloo.rotation.y = -0.13;
    const structure = new THREE.Group();
    structure.name = 'IglooStructure';
    igloo.add(structure);
    scene.add(igloo);

    const centralFire = createIglooFire();
    centralFire.position.set(0, 0.015, 0);
    igloo.add(centralFire);

    const fireShadowLight = centralFire.getObjectByName('FireGlow');
    // A point-light shadow renders the scene six additional times per frame.
    // The fire retains its full illumination and pulse without that cost.
    fireShadowLight.castShadow = false;

    const groundSnow = createGroundSnow(
      isLowPower,
      boulderRockMaterial,
      boulderSnowMaterial,
    );
    igloo.add(groundSnow);

    const footprints = createFootprintTrail({
      sitePosition: site.position,
      iglooPosition: igloo.position,
      iglooRotationY: igloo.rotation.y,
      snowTextures: snowSurfaceTextures,
    });
    site.add(footprints);

    const arcticWalker = createArcticWalker(isLowPower);
    igloo.add(arcticWalker);
    const interiorBench = createInteriorBench(isLowPower);
    igloo.add(interiorBench);
    const walkerWorldCos = Math.cos(igloo.rotation.y);
    const walkerWorldSin = Math.sin(igloo.rotation.y);
    function getWalkerGroundHeight(localX, localZ) {
      const siteX =
        igloo.position.x +
        walkerWorldCos * localX +
        walkerWorldSin * localZ -
        site.position.x;
      const siteZ =
        igloo.position.z -
        walkerWorldSin * localX +
        walkerWorldCos * localZ -
        site.position.z;
      const edgeProgress = Math.hypot(
        siteX / (11.8 * 1.14),
        siteZ / (11.8 * 0.94),
      );
      return evaluateIglooSiteHeight(siteX, siteZ, edgeProgress);
    }
    arcticWalker.userData.update(0, getWalkerGroundHeight, footprints);

    const fireRimPulse = { value: 1 };

    function makeIceMaterial(color, roughness) {
      const material = new THREE.MeshPhysicalMaterial({
        color,
        roughness,
        metalness: 0,
        clearcoat: 0.018,
        clearcoatRoughness: 0.94,
        sheen: 0.025,
        sheenRoughness: 0.96,
        sheenColor: 0xc8d0d3,
        side: THREE.DoubleSide,
        flatShading: true,
      });

      material.onBeforeCompile = (shader) => {
        shader.uniforms.uFireRimPulse = fireRimPulse;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
          uniform float uFireRimPulse;`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float fireRim = pow(
            1.0 - saturate(abs(dot(normalize(vViewPosition), normal))),
            3.2
          );
          totalEmissiveRadiance +=
            vec3(1.0, 0.16, 0.025) * fireRim * uFireRimPulse * 0.34;`,
        );
      };
      material.customProgramCacheKey = () => 'lightweight-fire-rim-v1';
      return material;
    }

    const snowMaterials = [
      makeIceMaterial(0xc9ced0, 0.9),
      makeIceMaterial(0xbec5c8, 0.94),
      makeIceMaterial(0xd2d5d6, 0.87),
    ];

    const iglooBlocks = [];
    let geometrySeed = 41;

    function nextGeometrySeed() {
      geometrySeed += 29;
      return geometrySeed;
    }

    function registerBlock(mesh, type, detail = {}) {
      const index = iglooBlocks.length + 1;
      mesh.name = `igloo-block-${String(index).padStart(3, '0')}`;
      mesh.userData = { blockId: index, type, ...detail };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      iglooBlocks.push(mesh);
      structure.add(mesh);
      return mesh;
    }

    function getSurfaceProfile(seed) {
      // A low-discrepancy art-directed sequence avoids accidental clusters of
      // equally rough blocks while keeping the finish from visibly repeating.
      const finishSequence = [1, 0, 1, 2, 1, 1, 0, 1, 0, 2, 1, 0, 1, 1, 0, 1, 2];
      const finish = finishSequence[Math.abs(Math.round(seed / 29)) % finishSequence.length];

      if (finish === 0) {
        return { detail: 0.44, chips: 0.08, plates: 0.36, colorVariation: 0.018 };
      }

      if (finish === 1) {
        return { detail: 0.72, chips: 0.2, plates: 0.54, colorVariation: 0.026 };
      }

      return { detail: 1, chips: 0.56, plates: 0.92, colorVariation: 0.035 };
    }

    function makeWeatheredBlockGeometry(width, height, depth, radius, seed) {
      const widthSegments = THREE.MathUtils.clamp(Math.ceil(width * 26), 28, 52);
      const heightSegments = THREE.MathUtils.clamp(Math.ceil(height * 38), 24, 42);
      const depthSegments = THREE.MathUtils.clamp(Math.ceil(depth * 30), 26, 52);
      const smallestDimension = Math.min(width, height, depth);
      const bevel = Math.min(radius * 0.56, smallestDimension * 0.24);
      const surfaceProfile = getSurfaceProfile(seed);
      const rockAssignment = getRockTextureAssignment(seed);
      const halfWidth = width * 0.5;
      const halfHeight = height * 0.5;
      const halfDepth = depth * 0.5;
      const innerWidth = Math.max(0.001, halfWidth - bevel);
      const innerHeight = Math.max(0.001, halfHeight - bevel);
      const innerDepth = Math.max(0.001, halfDepth - bevel);
      const leanX = hashNoise(2, 5, 11, seed) * width * 0.007;
      const leanZ = hashNoise(7, 3, 13, seed) * depth * 0.007;

      let geometry = new THREE.BoxGeometry(
        width,
        height,
        depth,
        widthSegments,
        heightSegments,
        depthSegments,
      );
      geometry.deleteAttribute('normal');
      geometry.deleteAttribute('uv');

      const positions = geometry.getAttribute('position');
      const roundedNormal = new THREE.Vector3();
      for (let index = 0; index < positions.count; index += 1) {
        const sourceX = positions.getX(index);
        const sourceY = positions.getY(index);
        const sourceZ = positions.getZ(index);
        const coreX = THREE.MathUtils.clamp(sourceX, -innerWidth, innerWidth);
        const coreY = THREE.MathUtils.clamp(sourceY, -innerHeight, innerHeight);
        const coreZ = THREE.MathUtils.clamp(sourceZ, -innerDepth, innerDepth);

        roundedNormal
          .set(sourceX - coreX, sourceY - coreY, sourceZ - coreZ)
          .normalize();

        const sampleX = sourceX / width + seed * 0.013;
        const sampleY = sourceY / height - seed * 0.009;
        const sampleZ = sourceZ / depth + seed * 0.017;
        const broadForm = fractalNoise3(
          sampleX * 1.55,
          sampleY * 1.55,
          sampleZ * 1.55,
          seed,
        );
        const brokenCrust = fractalNoise3(
          sampleX * 4.6,
          sampleY * 4.6,
          sampleZ * 4.6,
          seed + 23,
        );
        const chipField = valueNoise3(
          sampleX * 7.5,
          sampleY * 7.5,
          sampleZ * 7.5,
          seed + 57,
        );
        const chippedDent = THREE.MathUtils.smoothstep(chipField, 0.38, 0.76);
        const absoluteNormalX = Math.abs(roundedNormal.x);
        const absoluteNormalY = Math.abs(roundedNormal.y);
        const absoluteNormalZ = Math.abs(roundedNormal.z);
        let crustU;
        let crustV;
        if (absoluteNormalX >= absoluteNormalY && absoluteNormalX >= absoluteNormalZ) {
          crustU = sourceY / height;
          crustV = sourceZ / depth;
        } else if (absoluteNormalY >= absoluteNormalZ) {
          crustU = sourceX / width;
          crustV = sourceZ / depth;
        } else {
          crustU = sourceX / width;
          crustV = sourceY / height;
        }
        const distanceFromFaceEdge = Math.max(
          0,
          0.5 - Math.max(Math.abs(crustU), Math.abs(crustV)),
        );
        const faceInterior = THREE.MathUtils.smoothstep(
          distanceFromFaceEdge,
          0.008,
          0.08,
        );
        const geometricRelief =
          evaluateRockTexture(rockAssignment, crustU * 2, crustV * 2) *
          faceInterior *
          Math.min(1, smallestDimension / 0.5);
        const relief =
          smallestDimension *
          (
            broadForm * (0.008 + surfaceProfile.detail * 0.004) +
            faceInterior *
              (
                brokenCrust * 0.003 * surfaceProfile.detail -
                chippedDent * 0.0025 * surfaceProfile.chips
              )
          ) +
          geometricRelief;
        const roundedRadius = Math.max(bevel * 0.68, bevel + relief);
        const verticalRatio = sourceY / height;

        positions.setXYZ(
          index,
          coreX + roundedNormal.x * roundedRadius + verticalRatio * leanX,
          coreY + roundedNormal.y * roundedRadius,
          coreZ + roundedNormal.z * roundedRadius + verticalRatio * leanZ,
        );
      }
      positions.needsUpdate = true;

      geometry = mergeVertices(geometry, 0.00001);
      geometry.computeVertexNormals();
      return geometry;
    }

    function weatherGeometry(geometry, seed, amount, exposedVertexCount = null) {
      geometry.computeVertexNormals();
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const uvs = geometry.getAttribute('uv');
      const vertexCount = exposedVertexCount ?? positions.count;
      const surfaceProfile = getSurfaceProfile(seed);
      const rockAssignment = getRockTextureAssignment(seed);

      for (let index = 0; index < vertexCount; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const z = positions.getZ(index);
        const broad = fractalNoise3(x * 0.75, y * 0.75, z * 0.75, seed);
        const crust = fractalNoise3(x * 2.8, y * 2.8, z * 2.8, seed + 31);
        const displacement =
          amount *
          (
            broad * 0.055 +
            crust * 0.035 * surfaceProfile.detail
          ) +
          (uvs
            ? evaluateRockTexture(
                rockAssignment,
                uvs.getX(index) * 2 - 1,
                uvs.getY(index) * 2 - 1,
              )
            : 0);
        positions.setXYZ(
          index,
          x + normals.getX(index) * displacement,
          y + normals.getY(index) * displacement,
          z + normals.getZ(index) * displacement,
        );
      }

      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      return geometry;
    }

    function makeRoundedBlock(
      width,
      height,
      depth,
      materialIndex = 0,
      radius = 0.1,
    ) {
      const geometry = makeWeatheredBlockGeometry(
        width,
        height,
        depth,
        radius,
        nextGeometrySeed(),
      );
      return new THREE.Mesh(
        geometry,
        snowMaterials[materialIndex % snowMaterials.length],
      );
    }

    function makeCrownCap(materialIndex = 0) {
      const geometry = new THREE.SphereGeometry(0.46, 48, 24);
      weatherGeometry(geometry, nextGeometrySeed(), 0.042);
      const cap = new THREE.Mesh(
        geometry,
        snowMaterials[materialIndex % snowMaterials.length],
      );
      cap.scale.y = 0.24;
      return cap;
    }

    const domeRadius = 3.72;
    const domeShoulderHeight = 0.55;
    const domeCapHeight = 3.72;
    const entranceCutHalfWidth = 0.65;
    const entranceCutArchCenterY = 1.16;
    const entranceCutArchRadius = 0.69;

    function isInsideEntranceCut(x, y, z) {
      if (z <= 0 || y < -0.08) return false;
      if (y <= entranceCutArchCenterY) {
        return Math.abs(x) < entranceCutHalfWidth;
      }

      const deltaY = y - entranceCutArchCenterY;
      return (
        x * x + deltaY * deltaY <
        entranceCutArchRadius * entranceCutArchRadius
      );
    }

    function domeRadiusAtHeight(y) {
      if (y <= domeShoulderHeight) return domeRadius;

      const capProgress = THREE.MathUtils.clamp(
        (y - domeShoulderHeight) / domeCapHeight,
        0,
        0.9999,
      );
      return domeRadius * Math.sqrt(1 - capProgress * capProgress);
    }

    function addQuad(indices, a, b, c, d, reversed = false) {
      if (reversed) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, b, c, b, d, c);
      }
    }

    function jaggedEdgeProfile(progress, seed) {
      const sampleLine = (frequency, seedOffset) => {
        const scaled = progress * frequency;
        const sampleIndex = Math.floor(scaled);
        return THREE.MathUtils.lerp(
          hashNoise(sampleIndex, seedOffset, 7, seed),
          hashNoise(sampleIndex + 1, seedOffset, 7, seed),
          scaled - sampleIndex,
        );
      };

      // Linear interpolation is intentional here: the changes of direction
      // stay faceted instead of turning into another perfectly smooth curve.
      return (
        sampleLine(6, 23) * 0.68 +
        sampleLine(13, 47) * 0.24 +
        sampleLine(23, 71) * 0.08
      );
    }

    function makeDomeBlock({
      y,
      height,
      angleCenter,
      angleSpan,
      thickness,
      materialIndex,
      bottomY = null,
      topY = null,
    }) {
      const angularSegments = 56;
      const verticalSegments = 42;
      const rowSize = angularSegments + 1;
      const vertices = [];
      const uvs = [];
      const indices = [];
      const seed = nextGeometrySeed();
      const rockAssignment = getRockTextureAssignment(seed);
      const innerRockAssignment = getRockTextureAssignment(seed + 419);
      const rise = Math.max(0, y - domeShoulderHeight);
      const sinTilt = THREE.MathUtils.clamp(rise / domeCapHeight, 0, 0.9999);
      const cosTilt = Math.sqrt(1 - sinTilt * sinTilt);
      const courseSurfaceRadius = domeRadiusAtHeight(y);
      const hasJoinedBounds = bottomY !== null && topY !== null;
      const joinedBottomRadius = hasJoinedBounds
        ? domeRadiusAtHeight(bottomY)
        : 0;
      const joinedTopRadius = hasJoinedBounds
        ? domeRadiusAtHeight(topY)
        : 0;
      const joinedRadiusSlope = hasJoinedBounds
        ? (joinedTopRadius - joinedBottomRadius) / (topY - bottomY)
        : 0;
      const joinedNormalScale = 1 / Math.sqrt(1 + joinedRadiusSlope ** 2);
      const joinedNormalRadial = joinedNormalScale;
      const joinedNormalY = -joinedRadiusSlope * joinedNormalScale;

      for (let shell = 0; shell < 2; shell += 1) {
        for (let verticalIndex = 0; verticalIndex <= verticalSegments; verticalIndex += 1) {
          const verticalProgress = verticalIndex / verticalSegments;
          const verticalJitter =
            verticalIndex === 0 || verticalIndex === verticalSegments
              ? 0
              : hashNoise(angularSegments, verticalIndex, 41, seed) *
                (0.22 / verticalSegments);
          const sculptedVerticalProgress = THREE.MathUtils.clamp(
            verticalProgress + verticalJitter,
            0,
            1,
          );

          for (let angularIndex = 0; angularIndex <= angularSegments; angularIndex += 1) {
            const angularProgress = angularIndex / angularSegments;
            const angularJitter =
              angularIndex === 0 || angularIndex === angularSegments
                ? 0
                : hashNoise(angularIndex, verticalIndex, 17, seed) *
                  (0.24 / angularSegments);
            const sculptedAngularProgress = THREE.MathUtils.clamp(
              angularProgress + angularJitter,
              0,
              1,
            );

            // Move only the outline vertices. All interior positions, relief
            // sampling, UVs, and block-face shading remain exactly as before.
            const isHorizontalEdge =
              verticalIndex === 0 || verticalIndex === verticalSegments;
            const isVerticalEdge =
              angularIndex === 0 || angularIndex === angularSegments;
            const outlinedAngularProgress =
              sculptedAngularProgress +
              (isHorizontalEdge
                ? jaggedEdgeProfile(
                    sculptedAngularProgress,
                    seed + (verticalIndex === 0 ? 101 : 173),
                  ) * 0.036
                : 0);
            const outlinedVerticalProgress =
              sculptedVerticalProgress +
              (isVerticalEdge
                ? jaggedEdgeProfile(
                    sculptedVerticalProgress,
                    seed + (angularIndex === 0 ? 239 : 311),
                  ) * 0.04
                : 0);

            // Round only the rectangular corner boundary. The UVs and relief
            // coordinates continue to use the untouched sculpted progress, so
            // none of the procedural face texture is softened or resampled.
            let geometryAngularProgress = outlinedAngularProgress;
            let geometryVerticalProgress = outlinedVerticalProgress;
            const cornerRadiusAngular = 0.045;
            const cornerRadiusVertical = 0.078;
            const angularEdgeDistance = Math.min(
              sculptedAngularProgress,
              1 - sculptedAngularProgress,
            );
            const verticalEdgeDistance = Math.min(
              sculptedVerticalProgress,
              1 - sculptedVerticalProgress,
            );
            if (
              angularEdgeDistance < cornerRadiusAngular &&
              verticalEdgeDistance < cornerRadiusVertical
            ) {
              const cornerCenterAngular =
                sculptedAngularProgress < 0.5
                  ? cornerRadiusAngular
                  : 1 - cornerRadiusAngular;
              const cornerCenterVertical =
                sculptedVerticalProgress < 0.5
                  ? cornerRadiusVertical
                  : 1 - cornerRadiusVertical;
              const normalizedCornerX =
                (geometryAngularProgress - cornerCenterAngular) /
                cornerRadiusAngular;
              const normalizedCornerY =
                (geometryVerticalProgress - cornerCenterVertical) /
                cornerRadiusVertical;
              const cornerDistance = Math.hypot(
                normalizedCornerX,
                normalizedCornerY,
              );
              if (cornerDistance > 1) {
                geometryAngularProgress =
                  cornerCenterAngular +
                  (normalizedCornerX / cornerDistance) * cornerRadiusAngular;
                geometryVerticalProgress =
                  cornerCenterVertical +
                  (normalizedCornerY / cornerDistance) * cornerRadiusVertical;
              }
            }
            const angle =
              angleCenter + (geometryAngularProgress - 0.5) * angleSpan;
            const blockCrown =
              Math.sin(Math.PI * sculptedAngularProgress) *
              Math.sin(Math.PI * sculptedVerticalProgress);
            const nearestEdge = Math.min(
              angularEdgeDistance,
              verticalEdgeDistance,
            );
            const angularBevel =
              1 -
              THREE.MathUtils.smoothstep(
                angularEdgeDistance,
                0,
                cornerRadiusAngular,
              );
            const verticalBevel =
              1 -
              THREE.MathUtils.smoothstep(
                verticalEdgeDistance,
                0,
                cornerRadiusVertical,
              );
            const cornerBevel = angularBevel * verticalBevel;
            const bevelScale = hasJoinedBounds ? 0.55 : 1;
            const bevelInset =
              0.032 *
                (
                  angularBevel +
                  verticalBevel -
                  cornerBevel * 0.72
                ) *
                bevelScale +
              cornerBevel * 0.008 * bevelScale;
            const faceInterior = THREE.MathUtils.smoothstep(
              nearestEdge,
              0.008,
              0.09,
            );
            const faceX = sculptedAngularProgress * 2 - 1;
            const faceY = sculptedVerticalProgress * 2 - 1;
            const relief =
              shell === 0
                ? evaluateRockTexture(rockAssignment, faceX, faceY) * faceInterior
                : evaluateRockTexture(innerRockAssignment, faceX, faceY) *
                  faceInterior;
            const sineAngle = Math.sin(angle);
            const cosineAngle = Math.cos(angle);
            const normalRadial = hasJoinedBounds
              ? joinedNormalRadial
              : cosTilt;
            const normalY = hasJoinedBounds ? joinedNormalY : sinTilt;
            const normalX = sineAngle * normalRadial;
            const normalZ = cosineAngle * normalRadial;
            const tangentX = -sineAngle * sinTilt;
            const tangentY = cosTilt;
            const tangentZ = -cosineAngle * sinTilt;

            const surfaceOffset =
              blockCrown * faceInterior * 0.01 - bevelInset + relief;
            const inwardOffset =
              surfaceOffset - (shell === 0 ? 0 : thickness);
            if (hasJoinedBounds) {
              const surfaceY = THREE.MathUtils.lerp(
                bottomY,
                topY,
                geometryVerticalProgress,
              );
              const surfaceRadius = THREE.MathUtils.lerp(
                joinedBottomRadius,
                joinedTopRadius,
                geometryVerticalProgress,
              );
              vertices.push(
                sineAngle * surfaceRadius + normalX * inwardOffset,
                surfaceY + normalY * inwardOffset,
                cosineAngle * surfaceRadius + normalZ * inwardOffset,
              );
            } else {
              const outlinedLocalHeight =
                (geometryVerticalProgress - 0.5) * height;
              vertices.push(
                sineAngle * courseSurfaceRadius +
                  tangentX * outlinedLocalHeight +
                  normalX * inwardOffset,
                y + tangentY * outlinedLocalHeight + normalY * inwardOffset,
                cosineAngle * courseSurfaceRadius +
                  tangentZ * outlinedLocalHeight +
                  normalZ * inwardOffset,
              );
            }
            uvs.push(sculptedAngularProgress, sculptedVerticalProgress);
          }
        }
      }

      const shellSize = rowSize * (verticalSegments + 1);
      for (let verticalIndex = 0; verticalIndex < verticalSegments; verticalIndex += 1) {
        for (let angularIndex = 0; angularIndex < angularSegments; angularIndex += 1) {
          const outerA = verticalIndex * rowSize + angularIndex;
          const outerB = outerA + 1;
          const outerC = outerA + rowSize;
          const outerD = outerC + 1;
          addQuad(indices, outerA, outerB, outerC, outerD);

          const innerA = outerA + shellSize;
          const innerB = outerB + shellSize;
          const innerC = outerC + shellSize;
          const innerD = outerD + shellSize;
          addQuad(indices, innerA, innerB, innerC, innerD, true);
        }
      }

      const sideDepthSegments = 24;
      const sideOuterPoint = new THREE.Vector3();
      const sideInnerPoint = new THREE.Vector3();
      const sidePosition = new THREE.Vector3();
      const sideNormal = new THREE.Vector3();

      function readVertex(vertexIndex, target) {
        const offset = vertexIndex * 3;
        return target.set(
          vertices[offset],
          vertices[offset + 1],
          vertices[offset + 2],
        );
      }

      function appendDetailedSide({
        outerEdge,
        textureSeed,
        reverseWinding,
        getNormal,
      }) {
        const sideStart = vertices.length / 3;
        const sideRowSize = sideDepthSegments + 1;
        const sideAssignment = getRockTextureAssignment(textureSeed);
        const alongSegments = outerEdge.length - 1;

        outerEdge.forEach((outerIndex, alongIndex) => {
          readVertex(outerIndex, sideOuterPoint);
          readVertex(outerIndex + shellSize, sideInnerPoint);
          getNormal(sideOuterPoint, sideNormal);
          const alongProgress = alongIndex / alongSegments;

          for (let depthIndex = 0; depthIndex <= sideDepthSegments; depthIndex += 1) {
            const depthProgress = depthIndex / sideDepthSegments;
            sidePosition.lerpVectors(
              sideOuterPoint,
              sideInnerPoint,
              depthProgress,
            );
            const nearestEdge = Math.min(
              alongProgress,
              1 - alongProgress,
              depthProgress,
              1 - depthProgress,
            );
            const faceInterior = THREE.MathUtils.smoothstep(
              nearestEdge,
              0.008,
              0.09,
            );
            const relief =
              evaluateRockTexture(
                sideAssignment,
                alongProgress * 2 - 1,
                depthProgress * 2 - 1,
              ) * faceInterior;
            sidePosition.addScaledVector(sideNormal, relief);
            vertices.push(sidePosition.x, sidePosition.y, sidePosition.z);
            uvs.push(alongProgress, depthProgress);
          }
        });

        for (let alongIndex = 0; alongIndex < alongSegments; alongIndex += 1) {
          for (let depthIndex = 0; depthIndex < sideDepthSegments; depthIndex += 1) {
            const pointA =
              sideStart + alongIndex * sideRowSize + depthIndex;
            const pointB = pointA + 1;
            const pointC = pointA + sideRowSize;
            const pointD = pointC + 1;
            addQuad(
              indices,
              pointA,
              pointB,
              pointC,
              pointD,
              reverseWinding,
            );
          }
        }
      }

      const leftEdge = Array.from(
        { length: verticalSegments + 1 },
        (_, index) => index * rowSize,
      );
      const rightEdge = leftEdge.map((index) => index + angularSegments);
      const bottomEdge = Array.from(
        { length: angularSegments + 1 },
        (_, index) => index,
      );
      const topEdgeStart = verticalSegments * rowSize;
      const topEdge = bottomEdge.map((index) => topEdgeStart + index);

      const setAngularSideNormal = (direction) => (point, target) => {
        const inverseRadius = 1 / Math.max(Math.hypot(point.x, point.z), 0.0001);
        target.set(
          direction * point.z * inverseRadius,
          0,
          -direction * point.x * inverseRadius,
        );
      };
      const setVerticalSideNormal = (direction) => (point, target) => {
        const inverseRadius = 1 / Math.max(Math.hypot(point.x, point.z), 0.0001);
        if (hasJoinedBounds) {
          target.set(
            point.x * inverseRadius * joinedRadiusSlope,
            1,
            point.z * inverseRadius * joinedRadiusSlope,
          ).normalize();
        } else {
          target.set(
            -point.x * inverseRadius * sinTilt,
            cosTilt,
            -point.z * inverseRadius * sinTilt,
          );
        }
        target.multiplyScalar(direction);
      };

      appendDetailedSide({
        outerEdge: leftEdge,
        textureSeed: seed + 503,
        reverseWinding: true,
        getNormal: setAngularSideNormal(-1),
      });
      appendDetailedSide({
        outerEdge: rightEdge,
        textureSeed: seed + 587,
        reverseWinding: false,
        getNormal: setAngularSideNormal(1),
      });
      appendDetailedSide({
        outerEdge: bottomEdge,
        textureSeed: seed + 661,
        reverseWinding: false,
        getNormal: setVerticalSideNormal(-1),
      });
      appendDetailedSide({
        outerEdge: topEdge,
        textureSeed: seed + 743,
        reverseWinding: true,
        getNormal: setVerticalSideNormal(1),
      });

      const portalClippedIndices = [];
      for (let index = 0; index < indices.length; index += 3) {
        const vertexA = indices[index] * 3;
        const vertexB = indices[index + 1] * 3;
        const vertexC = indices[index + 2] * 3;
        const centerX =
          (vertices[vertexA] + vertices[vertexB] + vertices[vertexC]) / 3;
        const centerY =
          (vertices[vertexA + 1] +
            vertices[vertexB + 1] +
            vertices[vertexC + 1]) /
          3;
        const centerZ =
          (vertices[vertexA + 2] +
            vertices[vertexB + 2] +
            vertices[vertexC + 2]) /
          3;

        if (!isInsideEntranceCut(centerX, centerY, centerZ)) {
          portalClippedIndices.push(
            indices[index],
            indices[index + 1],
            indices[index + 2],
          );
        }
      }

      if (portalClippedIndices.length === 0) return null;

      let geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(portalClippedIndices);
      geometry.computeVertexNormals();

      return new THREE.Mesh(
        geometry,
        snowMaterials[materialIndex % snowMaterials.length],
      );
    }

    const tunnelArchOuterRadius = 1.38;
    const tunnelArchInnerRadius = 0.74;
    const tunnelArchCenterY = 1.16;

    function makeLegacyArchBlock({
      angleCenter,
      angleSpan,
      zCenter,
      depth,
      materialIndex,
    }) {
      const angularSegments = 42;
      const depthSegments = 32;
      const rowSize = angularSegments + 1;
      const vertices = [];
      const uvs = [];
      const indices = [];

      for (let shell = 0; shell < 2; shell += 1) {
        for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
          const depthProgress = depthIndex / depthSegments;
          const z = zCenter + (depthProgress - 0.5) * depth;

          for (let angularIndex = 0; angularIndex <= angularSegments; angularIndex += 1) {
            const angularProgress = angularIndex / angularSegments;
            const angle =
              angleCenter + (angularProgress - 0.5) * angleSpan;
            const blockCrown =
              Math.sin(Math.PI * angularProgress) *
              Math.sin(Math.PI * depthProgress) *
              0.035;
            const radius =
              (shell === 0
                ? tunnelArchOuterRadius
                : tunnelArchInnerRadius) +
              (shell === 0 ? blockCrown : 0);

            vertices.push(
              Math.sin(angle) * radius,
              tunnelArchCenterY + Math.cos(angle) * radius,
              z,
            );
            uvs.push(angularProgress, depthProgress);
          }
        }
      }

      const shellSize = rowSize * (depthSegments + 1);
      for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
        for (let angularIndex = 0; angularIndex < angularSegments; angularIndex += 1) {
          const outerA = depthIndex * rowSize + angularIndex;
          const outerB = outerA + 1;
          const outerC = outerA + rowSize;
          const outerD = outerC + 1;
          addQuad(indices, outerA, outerC, outerB, outerD);

          const innerA = outerA + shellSize;
          const innerB = outerB + shellSize;
          const innerC = outerC + shellSize;
          const innerD = outerD + shellSize;
          addQuad(indices, innerA, innerC, innerB, innerD, true);
        }
      }

      for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
        const nearOuterLeft = depthIndex * rowSize;
        const farOuterLeft = nearOuterLeft + rowSize;
        addQuad(
          indices,
          nearOuterLeft,
          nearOuterLeft + shellSize,
          farOuterLeft,
          farOuterLeft + shellSize,
        );

        const nearOuterRight = nearOuterLeft + angularSegments;
        const farOuterRight = nearOuterRight + rowSize;
        addQuad(
          indices,
          nearOuterRight,
          nearOuterRight + shellSize,
          farOuterRight,
          farOuterRight + shellSize,
          true,
        );
      }

      for (let angularIndex = 0; angularIndex < angularSegments; angularIndex += 1) {
        const backOuterA = angularIndex;
        const backOuterB = backOuterA + 1;
        addQuad(
          indices,
          backOuterA,
          backOuterB,
          backOuterA + shellSize,
          backOuterB + shellSize,
        );

        const frontOuterA = depthSegments * rowSize + angularIndex;
        const frontOuterB = frontOuterA + 1;
        addQuad(
          indices,
          frontOuterA,
          frontOuterB,
          frontOuterA + shellSize,
          frontOuterB + shellSize,
          true,
        );
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      weatherGeometry(geometry, nextGeometrySeed(), 0.072, shellSize);

      return new THREE.Mesh(
        geometry,
        snowMaterials[materialIndex % snowMaterials.length],
      );
    }

    function makeArchBlock({
      angleCenter,
      angleSpan,
      zCenter,
      depth,
      materialIndex,
    }) {
      const centerRadius =
        (tunnelArchOuterRadius + tunnelArchInnerRadius) * 0.5;
      const blockHeight =
        (tunnelArchOuterRadius - tunnelArchInnerRadius) * 0.94;
      const innerFaceRadius = centerRadius - blockHeight * 0.5;
      const outerFaceRadius = centerRadius + blockHeight * 0.5;
      const halfSpanTangent = Math.tan(angleSpan * 0.5);
      const innerFaceWidth = innerFaceRadius * halfSpanTangent * 2 * 0.985;
      const outerFaceWidth = outerFaceRadius * halfSpanTangent * 2 * 0.985;
      const averageWidth = (innerFaceWidth + outerFaceWidth) * 0.5;
      const geometry = makeWeatheredBlockGeometry(
        averageWidth,
        blockHeight,
        depth,
        0.07,
        nextGeometrySeed(),
      );

      // Taper the weathered cuboid into a true arch voussoir. Its inner edge
      // spans the short inner arc while its outer edge spans the longer outer
      // arc, so neighboring radial seams stay consistently narrow throughout.
      const archPositions = geometry.getAttribute('position');
      for (let index = 0; index < archPositions.count; index += 1) {
        const localY = archPositions.getY(index);
        const radialProgress = THREE.MathUtils.clamp(
          localY / blockHeight + 0.5,
          0,
          1,
        );
        const widthAtRadius = THREE.MathUtils.lerp(
          innerFaceWidth,
          outerFaceWidth,
          radialProgress,
        );
        archPositions.setX(
          index,
          archPositions.getX(index) * (widthAtRadius / averageWidth),
        );
      }
      archPositions.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const block = new THREE.Mesh(
        geometry,
        snowMaterials[materialIndex % snowMaterials.length],
      );
      block.position.set(
        Math.sin(angleCenter) * centerRadius,
        tunnelArchCenterY + Math.cos(angleCenter) * centerRadius,
        zCenter,
      );
      block.rotation.z = -angleCenter;
      return block;
    }

    const domeCourses = [
      { y: 0.35, count: 22, height: 0.6, thickness: 0.7 },
      { y: 1.0, count: 21, height: 0.59, thickness: 0.7 },
      { y: 1.62, count: 20, height: 0.59, thickness: 0.68 },
      { y: 2.19, count: 18, height: 0.58, thickness: 0.66 },
      { y: 2.7, count: 16, height: 0.58, thickness: 0.64 },
      { y: 3.15, count: 13, height: 0.58, thickness: 0.61 },
      { y: 3.54, count: 11, height: 0.57, thickness: 0.58, bottomY: 3.36, topY: 3.7 },
      { y: 3.86, count: 8, height: 0.56, thickness: 0.54, bottomY: 3.7, topY: 3.98 },
      { y: 4.1, count: 5, height: 0.52, thickness: 0.48, bottomY: 3.98, topY: 4.165 },
      { y: 4.23, count: 3, height: 0.38, thickness: 0.42, bottomY: 4.165, topY: 4.245 },
    ];

    domeCourses.forEach((course, courseIndex) => {
      const stagger = courseIndex % 2 ? Math.PI / course.count : 0;
      const upperCourseProgress = courseIndex / (domeCourses.length - 1);
      const jointClosure =
        0.988 + Math.pow(upperCourseProgress, 2) * 0.004;
      const angleSpan = ((Math.PI * 2) / course.count) * jointClosure;

      for (let index = 0; index < course.count; index += 1) {
        const angle = (index / course.count) * Math.PI * 2 + stagger;
        const rise = Math.max(0, course.y - domeShoulderHeight);
        const sinTilt = THREE.MathUtils.clamp(rise / domeCapHeight, 0, 0.9999);
        const cosTilt = Math.sqrt(1 - sinTilt * sinTilt);
        const block = makeDomeBlock({
          y: course.y,
          height: course.height,
          angleCenter: angle,
          angleSpan,
          thickness: course.thickness,
          materialIndex: courseIndex + index,
          bottomY: course.bottomY ?? null,
          topY: course.topY ?? null,
        });

        if (!block) continue;

        registerBlock(block, 'dome', {
          course: courseIndex,
          positionInCourse: index,
          courseCount: course.count,
          angle,
          explodeDirection: new THREE.Vector3(
            Math.sin(angle) * cosTilt,
            sinTilt,
            Math.cos(angle) * cosTilt,
          ).normalize(),
        });
      }
    });

    const crown = makeCrownCap(2);
    crown.position.set(0, 4.18, 0);
    crown.rotation.y = 0.37;
    registerBlock(crown, 'crown', {
      course: domeCourses.length,
      positionInCourse: 0,
      courseCount: 1,
      angle: 0,
      explodeDirection: new THREE.Vector3(0, 1, 0),
    });

    const tunnelBlockLength = 1.2;
    const tunnelFrontCenterZ = 4.85;
    const tunnelRearFrontZ =
      tunnelFrontCenterZ - tunnelBlockLength * 0.5 - 0.01;
    const attachmentClearance = 0.018;

    function domeFrontSurfaceZ(x, y) {
      const surfaceRadius = domeRadiusAtHeight(Math.max(0, y));
      return Math.sqrt(Math.max(0, surfaceRadius ** 2 - x ** 2));
    }

    function attachmentBackZ(samples) {
      return (
        Math.max(...samples.map(([x, y]) => domeFrontSurfaceZ(x, y))) +
        attachmentClearance
      );
    }

    [0, 1].forEach((depthIndex) => {
      [0.34, 0.98].forEach((y, rowIndex) => {
        [-1.015, 1.015].forEach((x, sideIndex) => {
          const outerX =
            Math.sign(x) * (Math.abs(x) + 0.68 * 0.5);
          const rearBackZ = attachmentBackZ([
            [outerX, y - 0.66 * 0.5],
            [outerX, y],
            [outerX, y + 0.66 * 0.5],
          ]);
          const blockDepth =
            depthIndex === 0
              ? tunnelRearFrontZ - rearBackZ
              : tunnelBlockLength;
          const z =
            depthIndex === 0
              ? (rearBackZ + tunnelRearFrontZ) * 0.5
              : tunnelFrontCenterZ;
          const wallBlock = makeRoundedBlock(
            0.68,
            0.66,
            blockDepth,
            depthIndex + rowIndex + sideIndex,
            0.06,
          );
          wallBlock.position.set(x, y, z);
          wallBlock.rotation.y = (sideIndex ? -1 : 1) * 0.018;
          registerBlock(wallBlock, 'tunnel-wall', {
            tunnelCourse: depthIndex,
            row: rowIndex,
            side: sideIndex ? 'right' : 'left',
          });
        });
      });
    });

    const archAngles = [-76, -57, -38, -19, 0, 19, 38, 57, 76].map(
      THREE.MathUtils.degToRad,
    );
    const archSpan = THREE.MathUtils.degToRad(18.7);
    [0, 1].forEach((depthIndex) => {
      archAngles.forEach((angle, archIndex) => {
        const contactSamples = [-0.5, 0, 0.5].map((spanProgress) => {
          const contactAngle = angle + spanProgress * archSpan;
          return [
            Math.sin(contactAngle) * tunnelArchOuterRadius,
            tunnelArchCenterY +
              Math.cos(contactAngle) * tunnelArchOuterRadius,
          ];
        });
        const rearBackZ = attachmentBackZ(contactSamples);
        const blockDepth =
          depthIndex === 0
            ? tunnelRearFrontZ - rearBackZ
            : tunnelBlockLength;
        const z =
          depthIndex === 0
            ? (rearBackZ + tunnelRearFrontZ) * 0.5
            : tunnelFrontCenterZ;
        const archBlock = makeArchBlock({
          angleCenter: angle,
          angleSpan: archSpan,
          zCenter: z,
          depth: blockDepth,
          materialIndex: archIndex + depthIndex,
        });
        registerBlock(archBlock, 'tunnel-arch', {
          tunnelCourse: depthIndex,
          positionInArch: archIndex,
        });
      });
    });

    const thresholdGeometry = makeWeatheredBlockGeometry(
      1.35,
      0.09,
      1.1,
      0.04,
      nextGeometrySeed(),
    );
    const threshold = new THREE.Mesh(thresholdGeometry, snowMaterials[1]);
    threshold.position.set(0, 0.02, 5.1);
    threshold.castShadow = true;
    threshold.receiveShadow = true;
    structure.add(threshold);

    const interactiveBlocks = iglooBlocks.filter(
      (block) => {
        if (block.userData.type === 'dome') {
          return block.userData.course > 0;
        }
        if (block.userData.type === 'tunnel-wall') {
          return block.userData.row > 0;
        }
        return (
          block.userData.type === 'crown' ||
          block.userData.type === 'tunnel-arch'
        );
      },
    );
    const interactiveBlockSet = new Set(interactiveBlocks);
    const explodeTargets = new Map();
    const rotationTargets = new Map();
    const blockMotion = new Map();
    const constructionOffsets = new Map();
    interactiveBlocks.forEach((block) => {
      block.userData.restPosition = block.position.clone();
      block.userData.restQuaternion = block.quaternion.clone();
      block.geometry.computeBoundingBox();
      block.geometry.computeBoundingSphere();
      const localCenter = block.geometry.boundingSphere.center.clone();
      const restCenter = localCenter
        .clone()
        .applyQuaternion(block.quaternion)
        .add(block.position);
      const boundsSize = new THREE.Vector3();
      block.geometry.boundingBox.getSize(boundsSize);
      block.userData.interactionAngle =
        block.userData.angle ?? Math.atan2(restCenter.x, restCenter.z);
      block.userData.explodeDirection ??= new THREE.Vector3(
        restCenter.x * 0.55,
        Math.max(0.12, restCenter.y - 0.72) * 0.3,
        restCenter.z,
      ).normalize();
      explodeTargets.set(block, block.position.clone());
      rotationTargets.set(block, block.quaternion.clone());
      constructionOffsets.set(block, new THREE.Vector3());
      const seed = block.userData.blockId;
      blockMotion.set(block, {
        velocity: new THREE.Vector3(),
        activateAt: 0,
        baseQuaternion: block.quaternion.clone(),
        localCenter,
        restCenter,
        currentCenter: restCenter.clone(),
        collisionRadius: THREE.MathUtils.clamp(
          boundsSize.length() * 0.24,
          0.2,
          0.42,
        ),
        wiggleAxis: new THREE.Vector3(
          hashNoise(seed, 7, 19, 2701),
          hashNoise(seed, 13, 5, 2731) * 0.45,
          hashNoise(seed, 3, 23, 2767),
        ).normalize(),
        phase: (hashNoise(seed, 11, 17, 2791) + 1) * Math.PI,
        frequency: 3.1 + (hashNoise(seed, 29, 2, 2819) + 1) * 1.35,
      });
    });

    const motionDelta = new THREE.Vector3();
    const motionCurl = new THREE.Vector3();
    const motionWobble = new THREE.Quaternion();
    const motionEuler = new THREE.Euler();
    const collisionDelta = new THREE.Vector3();
    const restShellOffset = new THREE.Vector3();
    let collisionParticipants = [];

    let explodedAnchorId = null;
    let constructionProgress = 0;
    let animationFrameId = null;
    let lastAnimationTime = performance.now();
    const animationStartTime = lastAnimationTime;
    // Desktop animation follows every display refresh. The former 45 fps cap
    // landed on every other frame on common 60 Hz displays, which made block
    // clicks feel less fluid than the underlying spring actually was.
    const minimumFrameInterval = isLowPower ? 1000 / 30 : 0;

    function animateScene(time) {
      if (time - lastAnimationTime < minimumFrameInterval) {
        animationFrameId = requestAnimationFrame(animateScene);
        return;
      }
      const deltaSeconds = Math.min((time - lastAnimationTime) / 1000, 0.05);
      const elapsedSeconds = (time - animationStartTime) / 1000;
      const positionDamping = Math.exp(-10.4 * deltaSeconds);
      const rotationEasing = 1 - Math.exp(-8.8 * deltaSeconds);
      lastAnimationTime = time;
      let hasBlockMotion = false;

      const viewEasing = 1 - Math.exp(-5.2 * deltaSeconds);
      const previousViewProgress = viewProgress;
      viewProgress = THREE.MathUtils.lerp(
        viewProgress,
        viewProgressTarget,
        viewEasing,
      );
      if (Math.abs(viewProgressTarget - viewProgress) < 0.0001) {
        viewProgress = viewProgressTarget;
      }
      if (Math.abs(previousViewProgress - viewProgress) > 0.000001) {
        const cameraProgress = THREE.MathUtils.clamp(viewProgress, 0, 1);
        const smoothedCameraProgress =
          cameraProgress * cameraProgress * (3 - 2 * cameraProgress);
        applyCameraView(smoothedCameraProgress);
        applyConstructionView(
          THREE.MathUtils.clamp(viewProgress - 1, 0, 1),
        );
      }

      interactiveBlocks.forEach((block) => {
        const target = explodeTargets.get(block);
        const targetQuaternion = rotationTargets.get(block);
        const motion = blockMotion.get(block);
        motionDelta.subVectors(target, block.position);

        const distance = motionDelta.length();
        const speed = motion.velocity.length();
        const rotationDistance = motion.baseQuaternion.angleTo(targetQuaternion);
        if (distance < 0.00035 && speed < 0.003 && rotationDistance < 0.001) {
          block.position.copy(target);
          motion.velocity.set(0, 0, 0);
          motion.baseQuaternion.copy(targetQuaternion);
          block.quaternion.copy(targetQuaternion);
          return;
        }

        hasBlockMotion = true;

        if (time < motion.activateAt) {
          motion.velocity.multiplyScalar(Math.exp(-12 * deltaSeconds));
          return;
        }

        // A near-critically damped spring gives the blocks a concise, soft
        // settle. A restrained perpendicular force keeps their paths organic
        // without the previous loose wobble.
        motion.velocity.addScaledVector(motionDelta, 42 * deltaSeconds);
        const activity = THREE.MathUtils.clamp(
          distance * 0.72 + speed * 0.22,
          0,
          1,
        );
        motionCurl
          .crossVectors(motion.wiggleAxis, motionDelta)
          .normalize()
          .multiplyScalar(
            Math.sin(elapsedSeconds * motion.frequency + motion.phase) *
              activity *
              0.42 *
              deltaSeconds,
          );
        motion.velocity.add(motionCurl).multiplyScalar(positionDamping);
        block.position.addScaledVector(motion.velocity, deltaSeconds);

        motion.baseQuaternion.slerp(targetQuaternion, rotationEasing);
        const wobble =
          Math.sin(elapsedSeconds * motion.frequency + motion.phase) *
          activity *
          0.026;
        motionWobble.setFromAxisAngle(motion.wiggleAxis, wobble);
        block.quaternion.copy(motion.baseQuaternion).multiply(motionWobble);
      });

      if (hasBlockMotion && collisionParticipants.length > 1) {
        // A local positional constraint prevents neighboring pieces from
        // crossing. It removes inward motion rather than adding a bounce, so
        // contact remains quiet and consistent with the damped animation.
        for (let pass = 0; pass < (isLowPower ? 1 : 2); pass += 1) {
          collisionParticipants.forEach((block) => {
            const motion = blockMotion.get(block);
            motion.currentCenter
              .copy(motion.localCenter)
              .applyQuaternion(block.quaternion)
              .add(block.position);
          });

          for (let firstIndex = 0; firstIndex < collisionParticipants.length; firstIndex += 1) {
            const firstBlock = collisionParticipants[firstIndex];
            const firstMotion = blockMotion.get(firstBlock);
            for (
              let secondIndex = firstIndex + 1;
              secondIndex < collisionParticipants.length;
              secondIndex += 1
            ) {
              const secondBlock = collisionParticipants[secondIndex];
              const secondMotion = blockMotion.get(secondBlock);
              collisionDelta.subVectors(
                secondMotion.currentCenter,
                firstMotion.currentCenter,
              );
              let centerDistance = collisionDelta.length();
              const restDistance = firstMotion.restCenter.distanceTo(
                secondMotion.restCenter,
              );
              const minimumDistance = Math.min(
                firstMotion.collisionRadius + secondMotion.collisionRadius,
                restDistance * 0.94,
              );
              if (centerDistance >= minimumDistance) continue;

              if (centerDistance < 0.0001) {
                collisionDelta
                  .subVectors(secondMotion.restCenter, firstMotion.restCenter)
                  .normalize();
                centerDistance = 0;
              } else {
                collisionDelta.multiplyScalar(1 / centerDistance);
              }

              const firstIsMoving =
                firstMotion.velocity.lengthSq() > 0.00001 ||
                firstBlock.position.distanceToSquared(
                  explodeTargets.get(firstBlock),
                ) > 0.00001;
              const secondIsMoving =
                secondMotion.velocity.lengthSq() > 0.00001 ||
                secondBlock.position.distanceToSquared(
                  explodeTargets.get(secondBlock),
                ) > 0.00001;
              const movableCount = Number(firstIsMoving) + Number(secondIsMoving);
              if (movableCount === 0) continue;

              const correction =
                (minimumDistance - centerDistance) * 0.52 / movableCount;
              if (firstIsMoving) {
                firstBlock.position.addScaledVector(collisionDelta, -correction);
                firstMotion.currentCenter.addScaledVector(collisionDelta, -correction);
                firstMotion.velocity.multiplyScalar(0.88);
              }
              if (secondIsMoving) {
                secondBlock.position.addScaledVector(collisionDelta, correction);
                secondMotion.currentCenter.addScaledVector(collisionDelta, correction);
                secondMotion.velocity.multiplyScalar(0.88);
              }
            }
          }
        }
      }

      if (hasBlockMotion && explodedAnchorId === null) {
        // The spring may overshoot while returning. Keep every block on the
        // exterior side of its original tangent plane so it can never pass
        // beneath the dome and enter the cached resting shadow. Removing only
        // the inward component of velocity gives a soft landing without a
        // visible bounce or changing the outward animation.
        interactiveBlocks.forEach((block) => {
          const motion = blockMotion.get(block);
          restShellOffset.subVectors(
            block.position,
            block.userData.restPosition,
          );
          const shellDistance = restShellOffset.dot(
            block.userData.explodeDirection,
          );
          if (shellDistance >= 0) return;

          block.position.addScaledVector(
            block.userData.explodeDirection,
            -shellDistance,
          );
          const inwardSpeed = motion.velocity.dot(
            block.userData.explodeDirection,
          );
          if (inwardSpeed < 0) {
            motion.velocity.addScaledVector(
              block.userData.explodeDirection,
              -inwardSpeed,
            );
          }
        });
      }

      centralFire.userData.update(
        elapsedSeconds,
        deltaSeconds,
      );
      groundSnow.userData.update(elapsedSeconds, deltaSeconds);
      arcticWalker.userData.update(
        elapsedSeconds,
        getWalkerGroundHeight,
        footprints,
      );
      fireRimPulse.value = centralFire.userData.glowPulse ?? 1;
      render();
      animationFrameId = requestAnimationFrame(animateScene);
    }

    function beginSceneAnimation() {
      if (animationFrameId !== null) return;
      lastAnimationTime = performance.now();
      animationFrameId = requestAnimationFrame(animateScene);
    }

    function setExplodedPatch(anchorBlock = null) {
      const shouldCollapse =
        !anchorBlock || anchorBlock.userData.blockId === explodedAnchorId;
      const activeAnchor = shouldCollapse ? null : anchorBlock;
      explodedAnchorId = activeAnchor?.userData.blockId ?? null;
      const commandTime = performance.now();

      interactiveBlocks.forEach((block) => {
        const target = explodeTargets.get(block);
        const targetQuaternion = rotationTargets.get(block);
        const motion = blockMotion.get(block);
        const restPosition = block.userData.restPosition;
        const restQuaternion = block.userData.restQuaternion;
        target.copy(restPosition).add(constructionOffsets.get(block));
        targetQuaternion.copy(restQuaternion);
        motion.activateAt = commandTime;
        motion.velocity.multiplyScalar(0.38);

        if (!activeAnchor) return;

        const blockSeed = block.userData.blockId;
        const neighborhoodJitter =
          hashNoise(blockSeed, activeAnchor.userData.blockId, 17, 3011) * 0.09;
        const usesDomeCoordinates =
          (block.userData.type === 'dome' || block.userData.type === 'crown') &&
          (activeAnchor.userData.type === 'dome' ||
            activeAnchor.userData.type === 'crown');
        let neighborhoodDistance;
        if (usesDomeCoordinates) {
          const courseDistance = Math.abs(
            block.userData.course - activeAnchor.userData.course,
          );
          const angleDistance = Math.abs(
            Math.atan2(
              Math.sin(block.userData.angle - activeAnchor.userData.angle),
              Math.cos(block.userData.angle - activeAnchor.userData.angle),
            ),
          );
          neighborhoodDistance = Math.sqrt(
            Math.pow(courseDistance / 3.2, 2) +
              Math.pow(angleDistance / 1.06, 2),
          );
        } else {
          neighborhoodDistance =
            motion.restCenter.distanceTo(
              blockMotion.get(activeAnchor).restCenter,
            ) / 2.85;
        }

        if (neighborhoodDistance >= 1.04 + neighborhoodJitter) return;

        const influence =
          1 - THREE.MathUtils.smoothstep(neighborhoodDistance, 0.04, 1.14);
        const motionInfluence = Math.pow(Math.max(influence, 0), 0.92);
        const extrusionDistance = 1.68 * motionInfluence;
        motion.activateAt =
          commandTime +
          neighborhoodDistance * 92 +
          (hashNoise(blockSeed, 53, activeAnchor.userData.blockId, 3041) + 1) *
            7;
        target.addScaledVector(
          block.userData.explodeDirection,
          extrusionDistance,
        );

        const tangent = new THREE.Vector3(
          Math.cos(block.userData.interactionAngle),
          0,
          -Math.sin(block.userData.interactionAngle),
        );
        const sidewaysVariation =
          hashNoise(blockSeed, 31, activeAnchor.userData.blockId, 3061);
        const heightVariation =
          hashNoise(blockSeed, 47, activeAnchor.userData.blockId, 3089);
        target.addScaledVector(
          tangent,
          sidewaysVariation * 0.5 * motionInfluence,
        );
        target.y +=
          heightVariation * 0.27 * motionInfluence +
          motionInfluence * 0.055;

        const rotationInfluence = motionInfluence;
        motionEuler.set(
          hashNoise(blockSeed, 5, 37, 3121) * 0.18 * rotationInfluence,
          hashNoise(blockSeed, 19, 41, 3163) * 0.22 * rotationInfluence,
          hashNoise(blockSeed, 43, 7, 3203) * 0.16 * rotationInfluence,
        );
        motionWobble.setFromEuler(motionEuler);
        targetQuaternion.copy(restQuaternion).multiply(motionWobble);
      });

      if (activeAnchor) {
        const anchorCenter = blockMotion.get(activeAnchor).restCenter;
        collisionParticipants = interactiveBlocks.filter(
          (block) =>
            blockMotion.get(block).restCenter.distanceTo(anchorCenter) < 4.15,
        );
      }

      beginSceneAnimation();
    }

    function applyConstructionView(progress) {
      if (Math.abs(progress - constructionProgress) < 0.000001) return;

      const nextOffset = new THREE.Vector3();
      const tangent = new THREE.Vector3();
      interactiveBlocks.forEach((block) => {
        const blockSeed = block.userData.blockId;
        const currentOffset = constructionOffsets.get(block);
        const delay =
          ((hashNoise(blockSeed, 17, 43, 3331) + 1) * 0.5) * 0.34;
        const reveal = THREE.MathUtils.smoothstep(
          progress,
          delay,
          Math.min(1, delay + 0.56),
        );
        const distance =
          (0.78 +
            (hashNoise(blockSeed, 31, 7, 3371) + 1) * 0.22) *
          reveal;
        const sidewaysDrift =
          hashNoise(blockSeed, 59, 13, 3407) * 0.16 * reveal;
        const lift =
          (0.04 + (hashNoise(blockSeed, 23, 61, 3449) + 1) * 0.055) *
          reveal;

        tangent.set(
          Math.cos(block.userData.interactionAngle),
          0,
          -Math.sin(block.userData.interactionAngle),
        );
        nextOffset
          .copy(block.userData.explodeDirection)
          .multiplyScalar(distance)
          .addScaledVector(tangent, sidewaysDrift);
        nextOffset.y += lift;

        explodeTargets
          .get(block)
          .sub(currentOffset)
          .add(nextOffset);
        currentOffset.copy(nextOffset);
        blockMotion.get(block).activateAt = 0;
      });

      const easedProgress = progress * progress * (3 - 2 * progress);
      structure.rotation.y = easedProgress * 0.1;
      structure.scale.setScalar(1 - easedProgress * 0.025);
      constructionProgress = progress;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPosition = null;
    let pointerDownViewProgress = 0;
    let activePointerId = null;
    let didDragView = false;

    function pickInteractiveBlock(event) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const selectedBlock =
        raycaster.intersectObjects(iglooBlocks, false)[0]?.object ?? null;
      return interactiveBlockSet.has(selectedBlock) ? selectedBlock : null;
    }

    function handlePointerDown(event) {
      if (event.button !== 0) return;
      pointerDownPosition = new THREE.Vector2(event.clientX, event.clientY);
      pointerDownViewProgress = viewProgressTarget;
      activePointerId = event.pointerId;
      didDragView = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      sceneHost.focus({ preventScroll: true });
    }

    function handlePointerMove(event) {
      if (!pointerDownPosition || event.pointerId !== activePointerId) return;
      const deltaX = event.clientX - pointerDownPosition.x;
      const deltaY = pointerDownPosition.y - event.clientY;
      if (Math.abs(deltaY) < 5 || Math.abs(deltaY) < Math.abs(deltaX) * 0.72) {
        return;
      }

      didDragView = true;
      const dragDistance = Math.max(260, sceneHost.clientHeight * 0.62);
      viewProgressTarget = THREE.MathUtils.clamp(
        pointerDownViewProgress + deltaY / dragDistance,
        0,
        maximumViewProgress,
      );
      renderer.domElement.style.cursor = 'grabbing';
      beginSceneAnimation();
    }

    function handlePointerUp(event) {
      if (
        !pointerDownPosition ||
        event.button !== 0 ||
        event.pointerId !== activePointerId
      ) {
        return;
      }
      const movement = pointerDownPosition.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY),
      );
      pointerDownPosition = null;
      activePointerId = null;
      renderer.domElement.style.cursor = 'pointer';
      if (movement > 6 || didDragView) return;
      setExplodedPatch(pickInteractiveBlock(event));
    }

    function handlePointerCancel(event) {
      if (event.pointerId !== activePointerId) return;
      pointerDownPosition = null;
      activePointerId = null;
      didDragView = false;
      renderer.domElement.style.cursor = 'pointer';
    }

    function handleWheel(event) {
      const deltaScale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? sceneHost.clientHeight
            : 1;
      viewProgressTarget = THREE.MathUtils.clamp(
        viewProgressTarget + event.deltaY * deltaScale * 0.00105,
        0,
        maximumViewProgress,
      );
      event.preventDefault();
      beginSceneAnimation();
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape' && explodedAnchorId !== null) {
        event.preventDefault();
        setExplodedPatch(null);
        return;
      }

      const viewStep =
        event.key === 'ArrowDown' || event.key === 'PageDown'
          ? 0.24
          : event.key === 'ArrowUp' || event.key === 'PageUp'
            ? -0.24
            : 0;
      if (viewStep === 0) return;
      event.preventDefault();
      viewProgressTarget = THREE.MathUtils.clamp(
        viewProgressTarget + viewStep,
        0,
        maximumViewProgress,
      );
      beginSceneAnimation();
    }

    renderer.domElement.style.cursor = 'pointer';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    sceneHost.addEventListener('keydown', handleKeyDown);

    const publicModel = Object.freeze({
      group: igloo,
      blocks: Object.freeze([...iglooBlocks]),
      scenery: Object.freeze({ outskirts, site }),
      explode: (blockId) => {
        const block = interactiveBlocks.find(
          (candidate) => candidate.userData.blockId === blockId,
        );
        if (block) setExplodedPatch(block);
      },
      collapse: () => setExplodedPatch(null),
      setViewProgress: (progress) => {
        viewProgressTarget = THREE.MathUtils.clamp(
          progress,
          0,
          maximumViewProgress,
        );
        beginSceneAnimation();
      },
    });
    window.iglooModel = publicModel;
    onBlockCount?.(iglooBlocks.length);
    hasFinishedModelConstruction = true;

    function render() {
      renderer.render(scene, camera);
      hasRenderedScene = true;
      queueReadyNotification();
    }

    function queueReadyNotification() {
      if (
        isDisposed ||
        readyFrameId !== null ||
        !hasFinishedModelConstruction ||
        !haveExternalAssetsLoaded ||
        !hasRenderedScene
      ) {
        return;
      }

      // The callback runs on the frame after the fully textured scene render,
      // so the splash is released by real scene readiness rather than a timer.
      readyFrameId = requestAnimationFrame(() => {
        readyFrameId = null;
        if (!isDisposed) onReady?.();
      });
    }

    function applyCameraView(progress) {
      camera.position.lerpVectors(
        cameraRestPosition,
        cameraScrolledPosition,
        progress,
      );
      cameraCurrentTarget.lerpVectors(
        cameraRestTarget,
        cameraScrolledTarget,
        progress,
      );
      camera.fov = THREE.MathUtils.lerp(
        cameraRestFov,
        cameraScrolledFov,
        progress,
      );
      camera.lookAt(cameraCurrentTarget);
      camera.updateProjectionMatrix();
      heroElement?.style.setProperty(
        '--view-copy-y',
        `${(-24 * progress).toFixed(2)}px`,
      );
      heroElement?.style.setProperty(
        '--view-copy-opacity',
        String(1 - progress * 0.28),
      );
    }

    function updateViewport() {
      const width = sceneHost.clientWidth;
      const height = sceneHost.clientHeight;
      if (!width || !height) return;

      const aspect = width / height;
      camera.aspect = aspect;

      if (aspect < 0.8) {
        cameraRestPosition.set(2.25, 5.4, 17.2);
        cameraScrolledPosition.set(-2.5, 6.35, 18.45);
        cameraRestTarget.set(2.25, 1.95, 1.1);
        cameraScrolledTarget.set(1.35, 2.2, 0.3);
        cameraRestFov = 57;
        cameraScrolledFov = 59;
      } else if (aspect < 1.35) {
        cameraRestPosition.set(10.8, 6.8, 14.4);
        cameraScrolledPosition.set(4.15, 8.25, 18.25);
        cameraRestTarget.set(1.8, 2.2, 0.35);
        cameraScrolledTarget.set(1.2, 2.1, -0.15);
        cameraRestFov = 34;
        cameraScrolledFov = 36;
      } else {
        cameraRestPosition.set(11.4, 7.1, 14.7);
        cameraScrolledPosition.set(3.65, 8.65, 18.85);
        cameraRestTarget.set(1.8, 2.15, 0.15);
        cameraScrolledTarget.set(1.1, 2.15, -0.25);
        cameraRestFov = 31;
        cameraScrolledFov = 34;
      }

      const cameraProgress = THREE.MathUtils.clamp(viewProgress, 0, 1);
      const smoothedCameraProgress =
        cameraProgress * cameraProgress * (3 - 2 * cameraProgress);
      applyCameraView(smoothedCameraProgress);
      applyConstructionView(
        THREE.MathUtils.clamp(viewProgress - 1, 0, 1),
      );
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(targetPixelRatio);
      render();
    }

    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(sceneHost);
    updateViewport();
    beginSceneAnimation();

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      if (readyFrameId !== null) cancelAnimationFrame(readyFrameId);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      sceneHost.removeEventListener('keydown', handleKeyDown);
      heroElement?.style.removeProperty('--view-copy-y');
      heroElement?.style.removeProperty('--view-copy-opacity');
      if (window.iglooModel === publicModel) delete window.iglooModel;

      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      scene.traverse((object) => {
        if (!object.geometry && !object.material) return;
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        objectMaterials.filter(Boolean).forEach((material) => {
          materials.add(material);
          if (material.map) textures.add(material.map);
          if (material.bumpMap) textures.add(material.bumpMap);
        });
      });
      geometries.forEach((geometry) => geometry.dispose());
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [onBlockCount, onReady]);

  return (
    <div
      ref={hostRef}
      className="scene"
      role="application"
      tabIndex={0}
      aria-label="Interactive three-dimensional igloo. Scroll or drag vertically to orbit the view, then continue to deconstruct the shelter block by block. Click a dome or entrance block to open a local exploded view; click it again or press Escape to close it."
    />
  );
}
