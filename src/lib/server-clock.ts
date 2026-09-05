import "server-only";

export function serverNow() {
  return new Date();
}

export function serverTimeOffset(milliseconds: number) {
  return new Date(serverNow().getTime() + milliseconds);
}
