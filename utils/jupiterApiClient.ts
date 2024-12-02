import { createJupiterApiClient, DefaultApi } from '@jup-ag/api';

let jupiterApiClient: DefaultApi | null = null;

export const getJupiterApiClient = () => {
  if (!jupiterApiClient) {
    jupiterApiClient = createJupiterApiClient();
  }
  return jupiterApiClient;
};

// Optional: Reset the Jupiter API client if needed
export const resetJupiterApiClient = () => {
  jupiterApiClient = null;
}; 