import { test as base, createBdd } from "playwright-bdd";

/** Every scenario starts from the seed: the test-only reset runs before each one. */
export const test = base.extend<{ fromSeed: undefined }>({
  fromSeed: [
    async ({ request }, use) => {
      const res = await request.post("/api/test/reset");
      if (!res.ok())
        throw new Error(`POST /api/test/reset gave ${res.status()}`);
      await use(undefined);
    },
    { auto: true },
  ],
});

export const { Given, When, Then } = createBdd(test);
