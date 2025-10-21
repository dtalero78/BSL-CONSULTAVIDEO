import { useState, useCallback } from 'react';
import { LocalVideoTrack } from 'twilio-video';
import { GaussianBlurBackgroundProcessor, VirtualBackgroundProcessor } from '@twilio/video-processors';

type BackgroundEffect = 'none' | 'blur' | 'virtual';

interface UseBackgroundEffectsReturn {
  currentEffect: BackgroundEffect;
  isProcessing: boolean;
  applyBlur: (track: LocalVideoTrack) => Promise<void>;
  applyVirtualBackground: (track: LocalVideoTrack, imageUrl: string) => Promise<void>;
  removeEffect: (track: LocalVideoTrack) => Promise<void>;
}

export const useBackgroundEffects = (): UseBackgroundEffectsReturn => {
  const [currentEffect, setCurrentEffect] = useState<BackgroundEffect>('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processor, setProcessor] = useState<GaussianBlurBackgroundProcessor | VirtualBackgroundProcessor | null>(null);

  const removeEffect = useCallback(async (track: LocalVideoTrack) => {
    try {
      setIsProcessing(true);

      // Si hay un procesador activo, removerlo
      if (processor) {
        // @ts-ignore - removeProcessor exists but types may not be updated
        await track.removeProcessor(processor);
        setProcessor(null);
      }

      setCurrentEffect('none');
    } catch (error) {
      console.error('Error removing background effect:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [processor]);

  const applyBlur = useCallback(async (track: LocalVideoTrack) => {
    try {
      setIsProcessing(true);

      // Remover efecto anterior si existe
      if (processor) {
        // @ts-ignore
        await track.removeProcessor(processor);
      }

      // Crear y aplicar blur usando CDN de Twilio
      const blurProcessor = new GaussianBlurBackgroundProcessor({
        assetsPath: 'https://sdk.twilio.com/js/video-processors/2.8.0/build',
        maskBlurRadius: 15,
        blurFilterRadius: 15,
      });

      await blurProcessor.loadModel();
      // @ts-ignore
      await track.addProcessor(blurProcessor);

      setProcessor(blurProcessor);
      setCurrentEffect('blur');
    } catch (error) {
      console.error('Error applying blur effect:', error);
      setCurrentEffect('none');
    } finally {
      setIsProcessing(false);
    }
  }, [processor]);

  const applyVirtualBackground = useCallback(async (track: LocalVideoTrack, imageUrl: string) => {
    try {
      setIsProcessing(true);

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

      // Crear y aplicar virtual background usando CDN de Twilio
      const virtualBgProcessor = new VirtualBackgroundProcessor({
        assetsPath: 'https://sdk.twilio.com/js/video-processors/2.8.0/build',
        backgroundImage: img,
        maskBlurRadius: 5,
      });

      await virtualBgProcessor.loadModel();
      // @ts-ignore
      await track.addProcessor(virtualBgProcessor);

      setProcessor(virtualBgProcessor);
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
