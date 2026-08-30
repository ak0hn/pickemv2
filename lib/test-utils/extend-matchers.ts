import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

// Import this directly into any jsdom-environment component test file:
// `import "@/lib/test-utils/extend-matchers";`
//
// Deliberately NOT done via vitest.config.ts's `setupFiles` and NOT
// `import "@testing-library/jest-dom/vitest"` — both hang vitest 4.1.11 at test-file
// import time in this project (reproducible, isolated, and confirmed during PIC-11):
// setupFiles never gets past the "RUN" banner for any file, and jest-dom's own /vitest
// entry point (which does `import { expect } from "vitest"` internally) does the same.
// A plain module that calls expect.extend() and gets imported directly by each test
// file, with no config-level setupFiles hook, is the only pattern confirmed to work.
expect.extend(matchers);
