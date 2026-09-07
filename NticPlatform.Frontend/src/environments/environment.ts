import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  apiUrl: '/api',
  gemini: {
    apiKey: 'REPLACE_GEMINI_API_KEY'
  }
};
