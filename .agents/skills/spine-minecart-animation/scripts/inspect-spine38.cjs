#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');

const [runtimePath, skelPath, atlasPath, animationName] = process.argv.slice(2);
if (!runtimePath || !skelPath || !atlasPath) {
  console.error('Usage: node inspect-spine38.cjs spine-webgl.js file.skel file.atlas [animation]');
  process.exit(2);
}

function loadSpine() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(runtimePath, 'utf8'), context, {
    filename: runtimePath, timeout: 5000,
  });
  if (!context.spine?.SkeletonBinary || !context.spine.TextureAtlas) {
    throw new Error('Provide the official Spine 3.8 spine-webgl.js browser build.');
  }
  return context.spine;
}

function readAtlas(spine, text) {
  const pages = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const name = lines[i].trim();
    const size = /^size:\s*(\d+)\s*,\s*(\d+)\s*$/.exec(lines[i + 1]);
    if (name && size) pages.set(name, { width: +size[1], height: +size[2] });
  }
  return new spine.TextureAtlas(text, name => {
    if (!pages.has(name)) throw new Error('Atlas page is missing an explicit size: ' + name);
    return { getImage: () => pages.get(name), setFilters() {}, setWraps() {} };
  });
}

const round = value => Number(value.toFixed(6));
const rgba = color => [color.r, color.g, color.b, color.a].map(round);
const spine = loadSpine();
const atlas = readAtlas(spine, fs.readFileSync(atlasPath, 'utf8'));
const bytes = fs.readFileSync(skelPath);

function headerString(offset) {
  let length = 0, shift = 0;
  let octet;
  do {
    if (offset >= bytes.length || shift >= 35) throw new Error('Invalid Spine header.');
    octet = bytes[offset++];
    length += (octet & 127) * 2 ** shift;
    shift += 7;
  } while (octet & 128);
  const end = offset + Math.max(0, length - 1);
  if (end > bytes.length) throw new Error('Truncated Spine header.');
  return [bytes.subarray(offset, end).toString('utf8'), end];
}

const [, versionOffset] = headerString(0);
const [version] = headerString(versionOffset);
if (!/^3\.8\.\d+$/.test(version)) {
  throw new Error('This script requires a Spine 3.8 skeleton. Header version: ' + version);
}
const reader = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
const data = reader.readSkeletonData(new Uint8Array(bytes));

function meshInfluences(mesh) {
  const influences = {};
  const indices = mesh.bones || [];
  let i = 0;
  while (i < indices.length) {
    const count = indices[i++];
    for (let j = 0; j < count; j++) {
      const name = data.bones[indices[i++]].name;
      influences[name] = (influences[name] || 0) + 1;
    }
  }
  return influences;
}

function describeAttachment(entry) {
  const attachment = entry.attachment;
  const info = {
    slot: data.slots[entry.slotIndex].name,
    name: entry.name,
    type: attachment.constructor.name,
    path: attachment.path,
  };
  if (attachment instanceof spine.MeshAttachment) {
    info.vertices = attachment.worldVerticesLength / 2;
    info.triangles = attachment.triangles.length / 3;
    info.weighted = attachment.bones != null;
    info.vertexInfluences = meshInfluences(attachment);
  }
  return info;
}

function describeTimeline(track) {
  const type = track.constructor.name;
  const frameCount = track.getFrameCount ? track.getFrameCount() : track.frames.length;
  const stride = frameCount ? track.frames.length / frameCount : 0;
  const keys = Array.from({ length: frameCount }, (_, i) => {
    const key = Array.from(track.frames.slice(i * stride, (i + 1) * stride), round);
    if (track.attachmentNames) key.push(track.attachmentNames[i]);
    if (track.drawOrders) key.push(track.drawOrders[i]);
    return key;
  });
  return {
    type,
    bone: data.bones[track.boneIndex]?.name,
    slot: data.slots[track.slotIndex]?.name,
    mesh: track.attachment?.name,
    keys,
    deformExtentFromFirst: track.frameVertices?.map(vertices =>
      round(vertices.reduce((max, v, i) =>
        Math.max(max, Math.abs(v - track.frameVertices[0][i])), 0))),
  };
}

function pose(animation, time) {
  const skeleton = new spine.Skeleton(data);
  animation.apply(skeleton, -1, time, false, null, 1,
    spine.MixBlend.setup, spine.MixDirection.mixIn);
  skeleton.updateWorldTransform();
  return skeleton.drawOrder.flatMap(slot => {
    const attachment = slot.getAttachment();
    if (!attachment || slot.color.a < 1 / 255) return [];
    const isRegion = attachment instanceof spine.RegionAttachment;
    const isMesh = attachment instanceof spine.MeshAttachment;
    if (!isRegion && !isMesh) return [];
    const vertices = new Float32Array(isRegion ? 8 : attachment.worldVerticesLength);
    if (isRegion) attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
    else attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
    return [{ slot: slot.data.name, attachment: attachment.name,
      color: rgba(slot.color), darkColor: slot.darkColor ? rgba(slot.darkColor) : null,
      vertices: Array.from(vertices, round) }];
  });
}

function describeAnimation(animation) {
  const timelines = animation.timelines.map(describeTimeline);
  const constantTracks = timelines.filter(track => {
    if (!track.keys.length || track.deformExtentFromFirst || track.type === 'EventTimeline') return false;
    const first = JSON.stringify(track.keys[0].slice(1));
    return track.keys.every(key => JSON.stringify(key.slice(1)) === first);
  });
  const start = pose(animation, 0);
  const end = pose(animation, animation.duration);
  return {
    name: animation.name,
    duration: round(animation.duration),
    timelines: timelines.length,
    keys: timelines.reduce((total, track) => total + track.keys.length, 0),
    sameValueTracks: constantTracks.length,
    additionalSameValueKeys: constantTracks.reduce((total, track) => total + track.keys.length - 1, 0),
    sampledVisibleRegionMeshStateMatchesAtEndpoints: JSON.stringify(start) === JSON.stringify(end),
    start,
    midpoint: pose(animation, animation.duration / 2),
    end,
    tracks: timelines,
  };
}

const animations = animationName
  ? data.animations.filter(animation => animation.name === animationName)
  : data.animations;
if (!animations.length) throw new Error('No matching animations.');

console.log(JSON.stringify({
  version: data.version,
  fps: data.fps,
  bounds: [data.x, data.y, data.width, data.height].map(round),
  atlasPages: atlas.pages.map(page => ({ name: page.name, width: page.width, height: page.height })),
  atlasRegions: atlas.regions.length,
  bones: data.bones.map(bone => ({
    name: bone.name, parent: bone.parent?.name,
    x: round(bone.x), y: round(bone.y), angle: round(bone.rotation),
    scale: [bone.scaleX, bone.scaleY].map(round),
  })),
  slots: data.slots.map(slot => ({
    name: slot.name, bone: slot.boneData.name,
    blend: spine.BlendMode[slot.blendMode], attachment: slot.attachmentName,
    color: rgba(slot.color),
  })),
  skins: data.skins.map(skin => ({ name: skin.name, attachments: skin.getAttachments().map(describeAttachment) })),
  constraints: { ik: data.ikConstraints.length, transform: data.transformConstraints.length, path: data.pathConstraints.length },
  animations: animations.map(describeAnimation),
}, null, 2));
