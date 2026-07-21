import { useState, useCallback } from 'react';
import type { LocalVideoTrack } from 'twilio-video';
import { GaussianBlurBackgroundProcessor, VirtualBackgroundProcessor } from '@twilio/video-processors';
import type { LocalVideoHandle } from '../video/video-engine';

type BackgroundEffect = 'none' | 'blur' | 'virtual';

interface UseBackgroundEffectsReturn {
  currentEffect: BackgroundEffect;
  isProcessing: boolean;
  applyBlur: (handle: LocalVideoHandle) => Promise<void>;
  applyVirtualBackground: (handle: LocalVideoHandle, imageUrl: string) => Promise<void>;
  removeEffect: (handle: LocalVideoHandle) => Promise<void>;
}

/**
 * Applies blur / virtual-background effects to the local video, regardless
 * of provider:
 * - Twilio: attaches a `@twilio/video-processors` processor directly to the
 *   `LocalVideoTrack` (assets vendored locally in `public/twilio-processors`
 *   — see CLAUDE.md, required to avoid 403s from Twilio's CDN).
 * - Chime: delegates to the engine (`ChimeVideoEngineLike`), which swaps the
 *   local camera input for a `DefaultVideoTransformDevice` wrapping a
 *   `BackgroundBlurVideoFrameProcessor` / `BackgroundReplacementVideoFrameProcessor`.
 *
 * Public API is unchanged so `VideoRoom.tsx` doesn't need to know which
 * provider is active — it just keeps passing the `localVideoTrack` handle
 * from `useVideoRoom`.
 */
export const useBackgroundEffects = (): UseBackgroundEffectsReturn => {
  const [currentEffect, setCurrentEffect] = useState<BackgroundEffect>('none');
  const [isProcessing, setIsProcessing] = useState(false);
  // Twilio-only: the processor instance currently attached to the LocalVideoTrack.
  const [processor, setProcessor] = useState<GaussianBlurBackgroundProcessor | VirtualBackgroundProcessor | null>(null);

  const removeEffect = useCallback(async (handle: LocalVideoHandle) => {
    try {
      setIsProcessing(true);

      if (handle.provider === 'twilio') {
        if (processor) {
          // @ts-ignore - removeProcessor exists but types may not be updated
          await handle.track.removeProcessor(processor);
          setProcessor(null);
        }
      } else {
        await handle.engine.removeVideoEffect();
      }

      setCurrentEffect('none');
    } catch (error) {
      console.error('Error removing background effect:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [processor]);

  const applyBlur = useCallback(async (handle: LocalVideoHandle) => {
    try {
      setIsProcessing(true);

      if (handle.provider === 'twilio') {
        const track: LocalVideoTrack = handle.track;

        // Remover efecto anterior si existe
        if (processor) {
          // @ts-ignore
          await track.removeProcessor(processor);
        }

        // Crear y aplicar blur usando archivos locales
        const blurProcessor = new GaussianBlurBackgroundProcessor({
          assetsPath: '/twilio-processors',
          maskBlurRadius: 15,
          blurFilterRadius: 15,
        });

        await blurProcessor.loadModel();
        // @ts-ignore
        await track.addProcessor(blurProcessor);

        setProcessor(blurProcessor);
      } else {
        await handle.engine.applyBackgroundBlur();
      }

      setCurrentEffect('blur');
    } catch (error) {
      console.error('Error applying blur effect:', error);
      setCurrentEffect('none');
    } finally {
      setIsProcessing(false);
    }
  }, [processor]);

  const applyVirtualBackground = useCallback(async (handle: LocalVideoHandle, imageUrl: string) => {
    try {
      setIsProcessing(true);

      if (handle.provider === 'twilio') {
        const track: LocalVideoTrack = handle.track;

        // Remover efecto anterior si existe
        if (processor) {
          // @ts-ignore
          await track.removeProcessor(processor);
        }

        // Crear imagen de fondo
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        // Crear y aplicar virtual background usando archivos locales
        const virtualBgProcessor = new VirtualBackgroundProcessor({
          assetsPath: '/twilio-processors',
          backgroundImage: img,
          maskBlurRadius: 5,
        });

        await virtualBgProcessor.loadModel();
        // @ts-ignore
        await track.addProcessor(virtualBgProcessor);

        setProcessor(virtualBgProcessor);
      } else {
        await handle.engine.applyVirtualBackground(imageUrl);
      }

      setCurrentEffect('virtual');
    } catch (error) {
      console.error('Error applying virtual background:', error);
      setCurrentEffect('none');
    } finally {
      setIsProcessing(false);
    }
  }, [processor]);

  return {
    currentEffect,
    isProcessing,
    applyBlur,
    applyVirtualBackground,
    removeEffect,
  };
};
