import type { CapacitorConfig } from '@capacitor/cli';
import { base } from '../capacitor.base';

const config: CapacitorConfig = {
  ...base,
  appId: 'in.getme.app',
  appName: 'GetMe',
  webDir: '../../web/dist/customer',
};
export default config;
