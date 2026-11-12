import type { CapacitorConfig } from '@capacitor/cli';
import { base } from '../capacitor.base';

const config: CapacitorConfig = {
  ...base,
  appId: 'in.getme.partner',
  appName: 'GetMe Partner',
  webDir: '../../web/dist/partner',
};
export default config;
