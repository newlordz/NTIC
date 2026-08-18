import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  apiUrl: '/api',
  brevo: {
    apiKey: 'REPLACE_BREVO_API_KEY',
    senderEmail: 'enochessel5@gmail.com',
    senderName: 'NTIC Ghana Championship'
  },
  smsmode: {
    apiKey: 'REPLACE_SMSMODE_API_KEY'
  },
  gemini: {
    apiKey: 'REPLACE_GEMINI_API_KEY'
  }
};

