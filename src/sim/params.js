// All tuning constants. Units: metres, seconds, radians.
export const PARAMS = {
  dt: 1 / 60,
  laps: 3,
  sectors: 8,
  countdown: 3,
  playerIndex: 4,
  track: { halfWidth: 7, runoff: 4 },
  car: {
    maxSpeed: 50, reverseMax: 10, accel: 16, brake: 30, drag: 0.0015, rolling: 1.2, turnAccel: 24,
    wheelbase: 2.6, maxSteer: 0.55, steerRate: 2.5, highSpeedSteerRate: 0.6, steerReturnRate: 8, highSpeedSteer: 0.3, yawResponse: 14, steerCurve: 1.6,
    grip: 9, driftGrip: 1.4, driftYaw: 0.5, gripRecovery: 0.3, radius: 1.3,
    grass: { speedMul: 0.55, gripMul: 0.6, dragMul: 4 },
  },
  collision: { wallRestitution: 0.3, wallSpeedPenalty: 0.15, carRestitution: 0.4 },
  ai: {
    skills: [1.0, 0.85, 0.7, 0.55], autopilotSkill: 0.85, lineOffsetMax: 2,
    lookaheadBase: 8, lookaheadTime: 0.5, steerGain: 6, maxLatAccel: 22, brakeDecel: 22,
    avoidAhead: 12, avoidLateral: 2.5, avoidShift: 3, stuckSpeed: 2, stuckTime: 1.5,
    recoverTime: 1, cooldownSpeed: 0.5,
  },
  assist: { minSpeed: 3, maxHeadingError: 1.6, lookMin: 10, lookTime: 0.6, gain: 2, maxSteer: 0.5 },
  grid: { spacing: 8, lateral: 3 },
};
