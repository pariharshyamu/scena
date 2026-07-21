import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Prop } from '../core/types';

export interface LampOptions {
  seed?: number;
  height?: number;
  /** Add a real PointLight. Off by default — lights are a budget. */
  light?: boolean;
  lightIntensity?: number;
  palette?: Palette;
}

/** A street lamp: post, head, glowing bulb, optional real PointLight. */
export function createLamp(options: LampOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const height = options.height ?? rng.range(2.6, 3.1);

  const group = new Group();
  group.name = 'lamp';
  const metal = new MeshStandardMaterial({ color: palette.metal, flatShading: true });

  const post = new Mesh(new CylinderGeometry(0.05, 0.08, height, 6), metal);
  post.position.y = height / 2;
  group.add(post);

  const head = new Mesh(new BoxGeometry(0.34, 0.26, 0.34), metal);
  head.position.y = height + 0.1;
  group.add(head);

  const bulb = new Mesh(
    new SphereGeometry(0.11, 8, 6),
    new MeshStandardMaterial({
      color: palette.lampGlow,
      emissive: palette.lampGlow,
      emissiveIntensity: 1.6,
    })
  );
  bulb.position.y = height - 0.03;
  group.add(bulb);

  if (options.light) {
    const light = new PointLight(palette.lampGlow, options.lightIntensity ?? 6, 12, 1.8);
    light.position.y = height - 0.05;
    group.add(light);
  }

  return { object: group, obstacleRadius: 0.25 };
}
