import { useEffect, useState } from 'react';

/**
 * Historia clínica nacional (IHCE, Res. 1888/2025) dentro de la consulta.
 *
 * Muestra los RDA que OTROS prestadores enviaron a la red del Ministerio sobre este
 * paciente: urgencias, hospitalizaciones, consultas y los antecedentes que declaró.
 *
 * Tres cosas deliberadas:
 *
 * 1. **Se abre desde la orden, nunca por cédula suelta.** El manual del MinSalud (5.8-D)
 *    pide que la consulta viva dentro de la atención y que no quede un buscador abierto.
 * 2. **El documento llega ya pintado desde PLATAFORMA2**, que es la única que habla con el
 *    Ministerio. Por eso se inserta como HTML: lo genera nuestro propio servidor, que
 *    escapa todo el contenido del documento al renderizarlo.
 * 3. **El acceso queda auditado** a nombre del médico de la orden, que es lo que el
 *    Ministerio registra como `humanuser`.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  historiaId: string;
  medicoCode?: string;
}

interface ItemRda {
  id: string;
  fecha?: string;
  tipo?: string;
  titulo?: string;
  institucion?: string;
  autor?: string;
}

interface Respuesta {
  success?: boolean;
  error?: string;
  paciente?: { numeroId?: string; nombre?: string };
  profesional?: string;
  consentimiento?: { telemedicina?: boolean | null; datos?: boolean | null };
  antecedentes?: { ok: boolean; items?: ItemRda[]; error?: string };
  encuentros?: { ok: boolean; items?: ItemRda[]; error?: string };
}

const fechaCorta = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const NationalHistoryModal = ({ isOpen, onClose, historiaId, medicoCode }: Props) => {
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Documento abierto: se guarda el HTML ya pintado que devuelve el servidor.
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [docCargando, setDocCargando] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    setDatos(null);
    setDocHtml(null);
    setDocError(null);

    (async () => {
      try {
        const r = await fetch(`/api/ihce/${encodeURIComponent(medicoCode || '')}/orden/${encodeURIComponent(historiaId)}`);
        const j = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !j || j.success === false) {
          setError((j && j.error) || `El servidor respondió ${r.status}`);
        } else {
          setDatos(j);
        }
      } catch (e: any) {
        if (vivo) setError(e?.message || 'No se pudo consultar la historia nacional');
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [isOpen, historiaId, medicoCode]);

  // El CSS del documento viene del mismo servidor que lo pinta; se inyecta una sola vez.
  const aplicarCss = (css?: string) => {
    if (!css || document.getElementById('ihce-doc-css')) return;
    const s = document.createElement('style');
    s.id = 'ihce-doc-css';
    s.textContent = css;
    document.head.appendChild(s);
  };

  const abrirDocumento = async (compositionId: string) => {
    setDocCargando(true);
    setDocError(null);
    setDocHtml(null);
    try {
      const r = await fetch(
        `/api/ihce/${encodeURIComponent(medicoCode || '')}/orden/${encodeURIComponent(historiaId)}/documento/${encodeURIComponent(compositionId)}`
      );
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.success === false || !j.html) {
        setDocError((j && j.error) || `El servidor respondió ${r.status}`);
      } else {
        aplicarCss(j.css);
        setDocHtml(j.html);
      }
    } catch (e: any) {
      setDocError(e?.message || 'No se pudo descargar el documento');
    } finally {
      setDocCargando(false);
    }
  };

  if (!isOpen) return null;

  const encuentros = datos?.encuentros?.items || [];
  const antecedentes = datos?.antecedentes?.items || [];

  const lista = (titulo: string, items: ItemRda[], falla?: string) => (
    <div className="mb-5">
      <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{titulo}</h4>
      {falla ? (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">{falla}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-400">Sin registros en la red nacional.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => abrirDocumento(it.id)}
              className="w-full text-left bg-[#2a3942] hover:bg-[#33434e] rounded-lg p-3 transition"
            >
              <div className="text-sm font-semibold text-white">{it.tipo || it.titulo || 'Documento'}</div>
              {(it.institucion || it.autor) && (
                <div className="text-xs text-gray-300 mt-0.5">{it.institucion || it.autor}</div>
              )}
              <div className="text-xs text-gray-400 mt-0.5">{fechaCorta(it.fecha)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[11000] p-4" onClick={onClose}>
      <div
        className="bg-[#1f2c34] rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b border-gray-700">
          <div>
            <h3 className="text-lg font-bold text-[#00a884]">Historia clínica nacional</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {datos?.paciente?.nombre || 'Paciente'}
              {datos?.paciente?.numeroId ? ` · CC ${datos.paciente.numeroId}` : ''}
              {datos?.profesional ? ` — consulta a nombre de ${datos.profesional}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none px-2" title="Cerrar">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cargando && <div className="text-gray-300 text-sm">Consultando la red nacional…</div>}

          {error && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">{error}</div>
          )}

          {/* Un documento abierto reemplaza el listado; se vuelve con el botón del pie. */}
          {docCargando && <div className="text-gray-300 text-sm">Descargando el documento…</div>}
          {docError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">{docError}</div>
          )}
          {docHtml && (
            <div className="bg-white rounded-lg p-4" dangerouslySetInnerHTML={{ __html: docHtml }} />
          )}

          {!cargando && !error && !docHtml && !docCargando && datos && (
            <>
              {lista('Encuentros clínicos', encuentros, datos.encuentros?.ok === false ? datos.encuentros?.error : undefined)}
              {lista('Antecedentes declarados por el paciente', antecedentes, datos.antecedentes?.ok === false ? datos.antecedentes?.error : undefined)}
              <p className="text-[11px] text-gray-500 leading-relaxed mt-4">
                Solo aparecen atenciones que otros prestadores hayan enviado a la red desde que se
                conectaron en 2026; no hay carga histórica. Cada consulta queda auditada a nombre del
                médico que atiende.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-3 border-t border-gray-700">
          {docHtml || docError ? (
            <button
              onClick={() => { setDocHtml(null); setDocError(null); }}
              className="px-3 py-2 text-sm bg-[#2a3942] text-gray-200 rounded-lg hover:bg-[#33434e] transition"
            >
              ← Volver al listado
            </button>
          ) : <span />}
          <button onClick={onClose} className="px-4 py-2 text-sm bg-[#00a884] text-white rounded-lg hover:bg-[#008f6f] transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
