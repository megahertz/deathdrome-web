import { originalDamping } from './drive.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner } from './game-types.ts';
export const CAMERA = GAME_TABLES.camera;
const RAD = Math.PI / 180;
export function updateLook(
  r: Pick<Runner, 'lookDegrees'> & Partial<Runner>,
  left = false,
  right = false,
) {
  let value = r.lookDegrees || 0;
  if (left && right) {
    value = 0;
  } else if (left) {
    value += CAMERA.lookStep;
  } else if (right) {
    value -= CAMERA.lookStep;
  } else if (Math.abs(value) < CAMERA.lookCenterThreshold) {
    value = 0;
  } else {
    value -= Math.sign(value) * CAMERA.lookStep;
  }
  r.lookDegrees = Math.max(
    -CAMERA.lookLimit,
    Math.min(CAMERA.lookLimit, value),
  );
}
export class ChaseCamera {
  declare runner: number | null | undefined;
  declare distance: number;
  declare height: number;
  declare bank: number;
  declare pitch: number;

  reset() {
    this.runner = null;
  }
  follow(
    r: import('./game-types.ts').RunnerPose &
      Pick<Runner, 'id' | 'speed' | 'turn' | 'vy'>,
    dt: number,
    rear = false,
    barrier = false,
  ) {
    if (this.runner !== r.id) {
      this.runner = r.id;
      this.distance = CAMERA.restDistance;
      this.height = r.y + CAMERA.height;
      this.bank = 0;
      this.pitch = 0;
    }
    if (rear) {
      const distance = -CAMERA.rearOffset[2];
      return {
        x: r.x - Math.sin(r.yaw) * distance,
        y: r.y + CAMERA.rearOffset[1],
        z: r.z - Math.cos(r.yaw) * distance,
        yaw: r.yaw + Math.PI,
        pitch: 0,
      };
    }
    const speed = Math.hypot(r.speed, r.vy || 0),
      activeBarrier = barrier && r.speed > 40,
      desiredDistance = activeBarrier
        ? CAMERA.barrierDistance
        : CAMERA.restDistance + speed * CAMERA.speedDistanceFactor,
      desiredHeight = activeBarrier ? CAMERA.barrierHeight : CAMERA.height;
    let damping = originalDamping(dt * CAMERA.distanceDamping);
    this.distance = this.distance * damping + desiredDistance * (1 - damping);
    const weight = Math.max(
        CAMERA.bankMinimumWeight,
        speed * CAMERA.bankSpeedFactor,
      ),
      bankTarget =
        r.speed > 0 && speed >= 0.5
          ? (r.turn / RAD) * CAMERA.bankTurnFactor +
            (activeBarrier ? CAMERA.barrierBank : 0)
          : 0;
    if (dt > 0) {
      this.bank = Math.max(
        -CAMERA.bankLimit,
        Math.min(
          CAMERA.bankLimit,
          (1 - weight) * this.bank - weight * bankTarget,
        ),
      );
    }
    const jumping = r.y > (r.floor ?? r.y) + 0.1;
    damping = originalDamping(
      dt * (jumping ? CAMERA.distanceDamping : CAMERA.heightDamping),
    );
    this.height = this.height * damping + (r.y + desiredHeight) * (1 - damping);
    const positionYaw = r.yaw + this.bank * RAD,
      x = r.x + Math.sin(positionYaw) * this.distance,
      z = r.z + Math.cos(positionYaw) * this.distance,
      y = this.height;
    const targetX = r.x - Math.sin(r.yaw) * CAMERA.lookAhead,
      targetZ = r.z - Math.cos(r.yaw) * CAMERA.lookAhead,
      targetY = r.y + CAMERA.lookHeight;
    const desiredPitch = Math.atan2(
      targetY - y,
      Math.hypot(targetX - x, targetZ - z),
    );
    damping = originalDamping(
      dt * (jumping ? CAMERA.jumpPitchDamping : CAMERA.pitchDamping),
    );
    this.pitch = this.pitch * damping + desiredPitch * (1 - damping);
    return {
      x,
      y,
      z,
      yaw: Math.atan2(x - targetX, z - targetZ) + (r.lookDegrees || 0) * RAD,
      pitch: this.pitch,
    };
  }
}
