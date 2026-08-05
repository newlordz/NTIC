import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  apiUrl: '/api',
  brevo: {
    apiKey: 'REPLACE_BREVO_API_KEY',
    senderEmail: 'enochessel5@gmail.com',
    senderName: 'NTIC Ghana Championship'
  },
  smsmode: {
    apiKey: ''
  },
  gemini: {
    apiKey: ''
  }
};
