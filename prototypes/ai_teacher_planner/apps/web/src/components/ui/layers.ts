/**
 * The open panels, in the order they were opened. Escape belongs to the one opened last,
 * whatever order the page's key listeners run in.
 */
export function createLayers() {
  const stack: symbol[] = [];
  return {
    open(): symbol {
      const layer = Symbol("layer");
      stack.push(layer);
      return layer;
    },
    close(layer: symbol): void {
      const at = stack.indexOf(layer);
      if (at >= 0) stack.splice(at, 1);
    },
    isTop(layer: symbol): boolean {
      return stack[stack.length - 1] === layer;
    },
  };
}

/** The page's one stack. */
export const layers = createLayers();
