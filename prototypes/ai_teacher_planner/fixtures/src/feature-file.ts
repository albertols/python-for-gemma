/** Path of `features/<name>.feature`, relative to the workspace root where vitest runs. */
export function featureFile(name: string): string {
  return `features/${name}.feature`;
}
