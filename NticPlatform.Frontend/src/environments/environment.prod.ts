import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  apiUrl: '/api',
  brevo: {
    apiKey: 'YOUR_BREVO_API_KEY_HERE',
    senderEmail: 'REPLACE_SENDER_EMAIL',
    senderName: 'NTIC Ghana Championship'
  },
  smsmode: {
    apiKey: ''
  },
  gemini: {
    apiKey: ''
  }
};
