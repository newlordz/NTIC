export interface Environment {
  production: boolean;
  apiUrl: string;
  brevo: {
    apiKey: string;
    senderEmail: string;
    senderName: string;
  };
  smsmode: {
    apiKey: string;
  };
  gemini: {
    apiKey: string;
  };
}
