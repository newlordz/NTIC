const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let isConnected = false;
let qrCodeData = null;
let connectionStatus = 'Initializing WhatsApp Client...';

const fs = require('fs');

function findSystemBrowserPath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const systemBrowserPath = findSystemBrowserPath();
if (systemBrowserPath) {
  console.log(`[WhatsApp Gateway] Found system browser: ${systemBrowserPath}`);
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './whatsapp_session' }),
  puppeteer: {
    headless: true,
    executablePath: systemBrowserPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  qrCodeData = qr;
  isConnected = false;
  connectionStatus = 'Waiting for QR scan...';
  console.log('\n======================================================');
  console.log('  NTIC WHATSAPP GATEWAY — SCAN QR CODE TO PAIR PHONE  ');
  console.log('======================================================\n');
  qrcode.generate(qr, { small: true });
  console.log('\nScan the QR code above using WhatsApp on your phone.\n');
});

client.on('ready', () => {
  isConnected = true;
  qrCodeData = null;
  connectionStatus = 'Connected and Ready!';
  console.log('\n SUCCESS: NTIC WhatsApp Gateway Connected & Ready!');
  console.log(` Connected User: ${client.info?.pushname || 'Active Phone'}`);
  console.log(` Endpoint: http://localhost:${PORT}/send\n`);
});

client.on('authenticated', () => {
  console.log('[WhatsApp Gateway] Session authenticated successfully.');
});

client.on('auth_failure', (msg) => {
  isConnected = false;
  connectionStatus = 'Authentication failed';
  console.error('[WhatsApp Gateway] Auth Failure:', msg);
});

client.on('disconnected', (reason) => {
  isConnected = false;
  connectionStatus = `Disconnected (${reason})`;
  console.log('[WhatsApp Gateway] Disconnected. Re-initializing...');
  client.initialize().catch(() => {});
});

// Helper to format phone number to WhatsApp Chat ID format
function formatToChatId(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '233' + cleaned.substring(1);
  }
  if (!cleaned.endsWith('@c.us')) {
    cleaned = cleaned + '@c.us';
  }
  return cleaned;
}

async function sendMessageInternal(targetPhone, message) {
  if (!targetPhone || !message) {
    const err = new Error('Phone number and message are required.');
    err.statusCode = 400;
    throw err;
  }

  if (!isConnected) {
    const err = new Error('WhatsApp Gateway is not paired or connected yet. Please scan QR code in server terminal.');
    err.statusCode = 503;
    throw err;
  }

  const chatId = formatToChatId(targetPhone);
  const sentMsg = await client.sendMessage(chatId, message);
  console.log(`[WhatsApp Gateway] Sent message to ${targetPhone} (ChatID: ${chatId})`);
  
  let msgId = 'sent';
  if (sentMsg && sentMsg.id) {
    msgId = sentMsg.id._serialized || sentMsg.id.id || 'sent';
  }
  
  return {
    success: true,
    messageId: msgId,
    recipient: targetPhone
  };
}

// API Routes
app.get('/status', (req, res) => {
  res.json({
    success: true,
    connected: isConnected,
    status: connectionStatus,
    user: client.info?.wid?.user || null,
    hasQrCode: !!qrCodeData
  });
});

app.post('/send', async (req, res) => {
  const { phone, number, message } = req.body;
  const targetPhone = phone || number;

  try {
    const result = await sendMessageInternal(targetPhone, message);
    return res.json(result);
  } catch (err) {
    console.error('[WhatsApp Gateway] Send Error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err?.message || 'Failed to send WhatsApp message.'
    });
  }
});

app.post('/send-otp', async (req, res) => {
  const { phone, number, otp } = req.body;
  const targetPhone = phone || number;

  if (!targetPhone || !otp) {
    return res.status(400).json({ success: false, error: 'Phone and OTP are required.' });
  }
  const message = `*NTIC Competition Platform*\n\nYour OTP verification code is: *${otp}*\n\nPlease enter this code on the registration page to verify your account. Do not share this PIN.`;
  
  try {
    const result = await sendMessageInternal(targetPhone, message);
    return res.json(result);
  } catch (err) {
    console.error('[WhatsApp Gateway] Send OTP Error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err?.message || 'Failed to send WhatsApp OTP.'
    });
  }
});

app.post('/send-credentials', async (req, res) => {
  const { phone, number, fullName, ticket, pin } = req.body;
  const targetPhone = phone || number;

  if (!targetPhone || !ticket || !pin) {
    return res.status(400).json({ success: false, error: 'Phone, ticket, and pin are required.' });
  }

  const message = `*NTIC Competition Platform*\n\nWelcome *${fullName || 'Participant'}*!\n\nYour account has been registered successfully.\nAccess Pass: *${ticket}*\nPIN Code: *${pin}*\n\nLogin Portal: https://ntic.edu.gh`;

  try {
    const result = await sendMessageInternal(targetPhone, message);
    return res.json(result);
  } catch (err) {
    console.error('[WhatsApp Gateway] Send Credentials Error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err?.message || 'Failed to send WhatsApp credentials.'
    });
  }
});

// Start Express Server & WhatsApp Client
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  NTIC WHATSAPP GATEWAY MICROSERVICE STARTED (Port ${PORT})  `);
  console.log(`======================================================\n`);
  client.initialize().catch((err) => {
    console.error('[WhatsApp Gateway] Failed to initialize client:', err);
  });
});
