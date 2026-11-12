import type { CapacitorConfig } from '@capacitor/cli';
import { base } from '../capacitor.base';

const config: CapacitorConfig = {
  ...base,
  appId: 'in.getme.shops',
  appName: 'GetMe Shops',
  webDir: '../../web/dist/shop',
};
export default config;
