// v1 circuit. s = 0 (first point) sits on the main straight.
export const TRACK01 = {
  halfWidth: 7,
  runoff: 4,
  points: [
    [0, -60], [0, 40], [0, 90], [0, 140],
    // T1: fast corner onto the top straight
    [14.6, 185.4], [50, 200], [100, 200], [150, 200],
    // T2: onto the back straight
    [178.3, 188.3], [190, 160], [190, 120],
    // chicane
    [183, 90], [197, 60], [190, 30],
    [190, -20], [190, -60],
    // T3: hairpin
    [182.7, -77.7], [165, -85], [147.3, -77.7], [140, -60],
    [140, -10], [140, 60],
    // T4: the one corner turning the other way
    [131.2, 81.2], [110, 90], [88.8, 81.2], [80, 60],
    [80, 20], [80, -60], [80, -150],
    // T5: long corner back onto the main straight
    [68.3, -178.3], [40, -190], [11.7, -178.3], [0, -150], [0, -110],
  ],
};
