import { expect, test } from "vitest";
import { createLayers } from "./layers.ts";

test("only the layer opened last is on top", () => {
  const layers = createLayers();
  const legend = layers.open();
  const drawer = layers.open();
  expect(layers.isTop(drawer)).toBe(true);
  expect(layers.isTop(legend)).toBe(false);
});

test("closing the top layer puts the one under it on top", () => {
  const layers = createLayers();
  const legend = layers.open();
  const drawer = layers.open();
  layers.close(drawer);
  expect(layers.isTop(legend)).toBe(true);
});

test("a layer closed out of order leaves the others in their order", () => {
  const layers = createLayers();
  const a = layers.open();
  const b = layers.open();
  const c = layers.open();
  layers.close(b);
  expect(layers.isTop(c)).toBe(true);
  layers.close(c);
  expect(layers.isTop(a)).toBe(true);
});

test("a layer that is not open is never on top", () => {
  const layers = createLayers();
  const a = layers.open();
  layers.close(a);
  expect(layers.isTop(a)).toBe(false);
});
