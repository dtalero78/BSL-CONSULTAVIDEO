/**
 * Factory del proveedor de video. Selecciona la implementación según
 * VIDEO_PROVIDER (default "twilio"). Solo instancia el proveedor elegido.
 */
import { IVideoProvider, VideoProviderName } from './types';
import { TwilioVideoProvider } from './twilio-video.provider';
import { ChimeVideoProvider } from './chime-video.provider';

function resolveProviderName(): VideoProviderName {
  const raw = (process.env.VIDEO_PROVIDER || 'twilio').toLowerCase();
  return raw === 'chime' ? 'chime' : 'twilio';
}

let instance: IVideoProvider | null = null;

export function getVideoProvider(): IVideoProvider {
  if (instance) return instance;
  const name = resolveProviderName();
  instance = name === 'chime' ? new ChimeVideoProvider() : new TwilioVideoProvider();
  console.log(`[VideoProvider] Proveedor de video activo: "${instance.name}"`);
  return instance;
}

export const videoProvider = getVideoProvider();
export * from './types';
