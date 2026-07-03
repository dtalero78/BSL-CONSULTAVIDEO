import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { X, Send, Loader2, MessageCircle } from 'lucide-react';
import apiService, { WaMensaje } from '../services/api.service';

// Socket.io del chat vive en bsl-plataforma (esta app es el tenant 'bsl'). Al
// conectarse a este host, la plataforma une el cliente al room tenant:bsl.
const PLATAFORMA_URL =
  import.meta.env.VITE_BSL_PLATAFORMA_URL || 'https://bsl-plataforma.com';

interface Props {
  celular: string;
  nombre: string;
  onClose: () => void;
}

function fmtHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// Evita duplicar el mensaje cuando llegan por dos vías (append optimista al
// responder + echo de Socket.io de la plataforma). Dedup por id real, o por
// dirección + contenido dentro de una ventana de 15s (el echo no siempre trae
// el mismo id que la respuesta del POST).
function esDuplicado(prev: WaMensaje[], m: WaMensaje): boolean {
  if (m.id && prev.some((x) => x.id === m.id)) return true;
  const t = new Date(m.createdAt).getTime();
  return prev.some(
    (x) =>
      x.direccion === m.direccion &&
      x.contenido === m.contenido &&
      Math.abs(new Date(x.createdAt).getTime() - t) < 15000
  );
}

/**
 * Ventana de chat de WhatsApp de UN paciente (abierta desde su fila en la
 * Agenda). Muestra el hilo entrante/saliente, escucha nuevos mensajes en vivo
 * por Socket.io y permite responder (texto libre — solo válido dentro de la
 * ventana de 24h de WhatsApp).
 */
export function WhatsappChatDrawer({ celular, nombre, onClose }: Props) {
  const [mensajes, setMensajes] = useState<WaMensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Celular canónico devuelto por el backend (E.164) — con el que filtramos el socket.
  const [canon, setCanon] = useState(celular);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Cargar hilo
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiService
      .getWhatsappMensajes(celular)
      .then((r) => {
        if (cancelled) return;
        setMensajes(r.mensajes || []);
        if (r.celular) setCanon(r.celular);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar la conversación.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [celular]);

  // Tiempo real desde bsl-plataforma (eventos nuevo_mensaje / nuevo-mensaje).
  useEffect(() => {
    const tail = (s: string) => (s || '').replace(/\D/g, '').slice(-10);
    const mine = tail(canon) || tail(celular);
    const socket: Socket = io(PLATAFORMA_URL, { transports: ['websocket', 'polling'] });
    const onMsg = (m: any) => {
      const cel = m?.celular || m?.numero_cliente || '';
      if (tail(cel) !== mine) return;
      const norm: WaMensaje = {
        id: Number(m?.id ?? 0) || 0,
        direccion: m?.direccion === 'saliente' ? 'saliente' : 'entrante',
        contenido: m?.contenido ?? '',
        tipoMensaje: m?.tipo_mensaje ?? 'text',
        mediaUrl: m?.media_url ?? null,
        createdAt: m?.timestamp ?? m?.created_at ?? new Date().toISOString(),
      };
      setMensajes((prev) => (esDuplicado(prev, norm) ? prev : [...prev, norm]));
    };
    socket.on('nuevo_mensaje', onMsg);
    socket.on('nuevo-mensaje', onMsg);
    return () => {
      socket.off('nuevo_mensaje', onMsg);
      socket.off('nuevo-mensaje', onMsg);
      socket.disconnect();
    };
  }, [canon, celular]);

  // Autoscroll al final
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, loading]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await apiService.sendWhatsappReply(celular, t);
      if (r.success && r.mensaje) {
        setTexto('');
        setMensajes((prev) => (esDuplicado(prev, r.mensaje!) ? prev : [...prev, r.mensaje!]));
      } else {
        setError(r.hint || r.error || 'No se pudo enviar el mensaje.');
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.hint || e?.response?.data?.error || 'No se pudo enviar el mensaje.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md h-full bg-[#0b141a] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1f2c34] border-b border-gray-700">
          <div className="w-9 h-9 rounded-full bg-[#00a884]/20 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-[#00a884]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm truncate">{nombre || 'Paciente'}</p>
            <p className="text-gray-400 text-xs truncate">{canon}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
            </div>
          ) : mensajes.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-10">
              Sin mensajes todavía. Lo que el paciente escriba por WhatsApp aparecerá aquí.
            </p>
          ) : (
            mensajes.map((m, i) => {
              const out = m.direccion === 'saliente';
              return (
                <div key={m.id || `tmp-${i}`} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      out ? 'bg-[#005c4b] text-white' : 'bg-[#202c33] text-gray-100'
                    }`}
                  >
                    {m.mediaUrl && (
                      <p className="text-xs italic opacity-70 mb-1">
                        [{m.tipoMensaje || 'media'}]
                      </p>
                    )}
                    {m.contenido && <p className="whitespace-pre-wrap break-words">{m.contenido}</p>}
                    <p className="text-[10px] opacity-60 text-right mt-1">{fmtHora(m.createdAt)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="px-3 py-3 bg-[#1f2c34] border-t border-gray-700">
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Escribe una respuesta…"
              rows={1}
              className="flex-1 resize-none bg-[#2a3942] text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none max-h-28"
            />
            <button
              onClick={enviar}
              disabled={sending || !texto.trim()}
              className="shrink-0 w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f6f] transition disabled:opacity-50"
              aria-label="Enviar"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Solo se puede responder dentro de las 24h desde el último mensaje del paciente.
          </p>
        </div>
      </div>
    </div>
  );
}

export default WhatsappChatDrawer;
