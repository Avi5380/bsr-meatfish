// ngrok tunnel for the meatfish-app server (port 3031)
// Requires NGROK_AUTHTOKEN env var (get from https://dashboard.ngrok.com after signup)

import ngrok from '@ngrok/ngrok';
import { writeFileSync } from 'fs';

const token = process.env.NGROK_AUTHTOKEN || '';
if (!token) {
  console.error('ERROR: NGROK_AUTHTOKEN env var not set.');
  console.error('Get a token at https://dashboard.ngrok.com/get-started/your-authtoken');
  process.exit(1);
}

console.log('Starting ngrok tunnel to localhost:3031...');
try {
  const listener = await ngrok.forward({
    addr: 3031,
    authtoken: token,
    // For free tier, omit hostname — ngrok assigns a random ngrok-free.app subdomain
  });
  const url = listener.url();
  console.log(`✓ Tunnel ready: ${url}`);
  writeFileSync('C:\\Users\\avraham\\meatfish-app\\current-url.txt', url, 'utf8');
  // Update desktop shortcut
  const shortcut = `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\n`;
  writeFileSync('D:\\user\\Desktop\\בשר ודגים - הוצאות והכנסות.url', shortcut, 'ascii');
  console.log('✓ Desktop shortcut updated');
  // Keep alive
  process.stdin.resume();
} catch (e) {
  console.error('ERROR:', e.message || e);
  process.exit(1);
}
