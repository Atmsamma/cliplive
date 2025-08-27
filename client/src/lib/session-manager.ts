// Legacy session-manager removed. This stub remains only to avoid build errors if
// some stale import lingers. All session logic now lives in SessionProvider +
// direct React Query hooks. Do not use this file.
export const sessionManager = {
  getSessionId: () => null,
  getStatus: async () => null,
  getClips: async () => [],
  startStream: async () => { throw new Error('sessionManager deprecated'); },
  stopStream: async () => { throw new Error('sessionManager deprecated'); },
};
