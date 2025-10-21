import { useState } from 'react';

interface BackgroundControlsProps {
  onApplyBlur: () => void;
  onApplyVirtualBackground: (imageUrl: string) => void;
  onRemoveEffect: () => void;
  isProcessing: boolean;
  currentEffect: 'none' | 'blur' | 'virtual';
}

export const BackgroundControls = ({
  onApplyBlur,
  onApplyVirtualBackground,
  onRemoveEffect,
  isProcessing,
  currentEffect,
}: BackgroundControlsProps) => {
  const [showMenu, setShowMenu] = useState(false);

  // Fondos virtuales pre-definidos
  const virtualBackgrounds = [
    {
      id: 'office',
      name: 'Oficina',
      url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop',
    },
    {
      id: 'nature',
      name: 'Naturaleza',
      url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
    },
    {
      id: 'abstract',
      name: 'Abstracto',
      url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&h=1080&fit=crop',
    },
  ];

  return (
    <div className="relative">
      {/* Botón principal */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="bg-[#2a3942] text-white p-3 rounded-full hover:bg-[#374850] transition flex items-center gap-2"
        title="Cambiar fondo"
        disabled={isProcessing}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {isProcessing && <span className="text-xs">...</span>}
      </button>

      {/* Menú desplegable */}
      {showMenu && (
        <div className="absolute bottom-full mb-2 right-0 bg-[#1f2c34] rounded-xl shadow-2xl p-3 min-w-[250px] border border-gray-700">
          <h3 className="text-white text-sm font-semibold mb-3 px-2">Efectos de fondo</h3>

          <div className="space-y-2">
            {/* Sin efecto */}
            <button
              onClick={() => {
                onRemoveEffect();
                setShowMenu(false);
              }}
              disabled={isProcessing}
              className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-3 ${
                currentEffect === 'none'
                  ? 'bg-[#00a884] text-white'
                  : 'text-gray-300 hover:bg-[#2a3942]'
              } disabled:opacity-50`}
            >
              <div className="w-12 h-8 bg-gray-600 rounded flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <span className="text-sm">Sin efecto</span>
            </button>

            {/* Blur */}
            <button
              onClick={() => {
                onApplyBlur();
                setShowMenu(false);
              }}
              disabled={isProcessing}
              className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-3 ${
                currentEffect === 'blur'
                  ? 'bg-[#00a884] text-white'
                  : 'text-gray-300 hover:bg-[#2a3942]'
              } disabled:opacity-50`}
            >
              <div className="w-12 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded blur-sm"></div>
              <span className="text-sm">Desenfocar fondo</span>
            </button>

            {/* Fondos virtuales */}
            <div className="border-t border-gray-700 my-2 pt-2">
              <p className="text-xs text-gray-500 px-2 mb-2">Fondos virtuales</p>
              {virtualBackgrounds.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => {
                    onApplyVirtualBackground(bg.url);
                    setShowMenu(false);
                  }}
                  disabled={isProcessing}
                  className="w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-3 text-gray-300 hover:bg-[#2a3942] disabled:opacity-50 mb-1"
                >
                  <div
                    className="w-12 h-8 rounded bg-cover bg-center"
                    style={{ backgroundImage: `url(${bg.url})` }}
                  ></div>
                  <span className="text-sm">{bg.name}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowMenu(false)}
            className="w-full mt-3 text-xs text-gray-500 hover:text-white transition py-1"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
};
