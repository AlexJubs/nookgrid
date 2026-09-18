import type { CapacitorConfig } from '@capacitor/cli';
import { isIP } from 'node:net';

const developmentUrl = process.env.NOOKGRID_DEV_URL;
if (developmentUrl) {
  const url = new URL(developmentUrl);
  const parts = url.hostname.split('.').map(Number);
  const isPrivate = isIP(url.hostname) === 4 && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
  if (url.protocol !== 'http:' || !url.port || url.origin !== developmentUrl || (!isPrivate && !['localhost','127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use a local development server URL without a path or credentials.');
  }
}

const config: CapacitorConfig = {
  appId: 'com.nookgrid.app',
  appName: 'NookGrid',
  webDir: 'dist/ios',
  ios: { contentInset: 'never' },
  ...(developmentUrl ? {server:{url:developmentUrl,cleartext:true}} : {})
};

export default config;
