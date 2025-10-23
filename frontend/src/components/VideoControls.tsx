import { BackgroundControls } from './BackgroundControls';

interface VideoControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  showBackgroundControls?: boolean;
  onApplyBlur?: () => void;
  onApplyVirtualBackground?: (imageUrl: string) => void;
  onRemoveEffect?: () => void;
  isProcessingBackground?: boolean;
  currentBackgroundEffect?: 'none' | 'blur' | 'virtual';
  showPosturalAnalysis?: boolean;
  onOpenPosturalAnalysis?: () => void;
}

export const VideoControls = ({
  isAudioEnabled,
  isVideoEnabled,
  onToggleAudio,
  onToggleVideo,
  onLeave,
  showBackgroundControls = false,
  onApplyBlur,
  onApplyVirtualBackground,
  onRemoveEffect,
  isProcessingBackground = false,
  currentBackgroundEffect = 'none',
  showPosturalAnalysis = false,
  onOpenPosturalAnalysis,
}: VideoControlsProps) => {
  return (
    <div className="bg-gradient-to-t from-black/80 via-black/60 to-transparent pb-safe">
      <div className="px-6 py-6 flex items-center justify-center gap-6">
        {/* Background Effects - Solo para doctores */}
        {showBackgroundControls && onApplyBlur && onApplyVirtualBackground && onRemoveEffect && (
          <BackgroundControls
            onApplyBlur={onApplyBlur}
            onApplyVirtualBackground={onApplyVirtualBackground}
            onRemoveEffect={onRemoveEffect}
            isProcessing={isProcessingBackground}
            currentEffect={currentBackgroundEffect}
          />
        )}

        {/* Video Toggle */}
        <button
          onClick={onToggleVideo}
          className={`w-14 h-14 rounded-full transition-all flex items-center justify-center ${
            isVideoEnabled
              ? 'bg-[#374045] hover:bg-[#4a5459] text-white'
              : 'bg-white/90 hover:bg-white text-gray-800'
          }`}
          title={isVideoEnabled ? 'Apagar cámara' : 'Encender cámara'}
        >
          {isVideoEnabled ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
            </svg>
          )}
        </button>

        {/* Audio Toggle */}
        <button
          onClick={onToggleAudio}
          className={`w-14 h-14 rounded-full transition-all flex items-center justify-center ${
            isAudioEnabled
              ? 'bg-[#374045] hover:bg-[#4a5459] text-white'
              : 'bg-white/90 hover:bg-white text-gray-800'
          }`}
          title={isAudioEnabled ? 'Silenciar' : 'Activar micrófono'}
        >
          {isAudioEnabled ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
            </svg>
          )}
        </button>

        {/* Postural Analysis - Solo para doctores */}
        {showPosturalAnalysis && onOpenPosturalAnalysis && (
          <button
            onClick={onOpenPosturalAnalysis}
            className="w-14 h-14 rounded-full bg-[#374045] hover:bg-[#4a5459] text-white transition-all flex items-center justify-center"
            title="Análisis Postural"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        )}

        {/* End Call */}
        <button
          onClick={onLeave}
          className="w-16 h-16 rounded-full bg-[#ff3b30] hover:bg-[#ff1f1f] text-white transition-all flex items-center justify-center shadow-lg"
          title="Finalizar llamada"
        >
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
        </button>
      </div>

      {/* WhatsApp attribution */}
      <div className="flex items-center justify-center gap-2 pb-4 text-xs text-gray-500">
        <span>Powered by</span>
        <span className="font-medium">BSL Video</span>
      </div>
    </div>
  );
};
