import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Explicit cleanup — vitest globals are off, so RTL cannot auto-register it.
afterEach(() => {
  cleanup();
});
