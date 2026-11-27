import { useState, useEffect } from 'react';
import apiService, { ResumenPostincapacidadData } from '../services/api.service';

/**
 * Resumen de la historia post-incapacidad que el paciente subió desde el link de WhatsApp
 * (Daniel, 27-nov-2026). Lo arma BSL-PLATAFORMA2 al terminar el Análisis Postincapacidad; el
 * médico presencial ve lo mismo en Órdenes. Las cifras las calcula código, no la IA.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  historiaId: string;
}

/** Igual que BSL-PLATAFORMA2: solo letras, sin tildes ni espacios, empieza por POSTINCAPACIDAD. */
export const esPostIncapacidad = (tipoExamen?: string | null): boolean =>
  String(tipoExamen || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .startsWith('POSTINCAPACIDAD');

const tramo = (t: { desde: string; hasta: string; dias: number }) =>
  `${t.desde} a ${t.hasta} (${t.dias} día${t.dias === 1 ? '' : 's'})`;

const Seccion = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="mt-4">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{titulo}</h3>
    {children}
  </div>
);

const Cifra = ({ valor, etiqueta }: { valor: number | string; etiqueta: string }) => (
  <div className="bg-[#111b21] border border-gray-700 rounded-lg p-3">
    <div className="text-xl font-semibold text-white">{valor}</div>
    <div className="text-xs text-gray-400">{etiqueta}</div>
  </div>
);

export const PostincapacidadResumenModal = ({ isOpen, onClose, historiaId }: Props) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<ResumenPostincapacidadData | null>(null);

  useEffect(() => {
    if (!isOpen || !historiaId) return;
    let vigente = true;
    setIsLoading(true);
    setError(null);
    setDatos(null);
    apiService
      .getResumenPostincapacidad(historiaId)
      .then((d) => { if (vigente) setDatos(d); })
      .catch((err: any) => { if (vigente) setError(err?.message || 'No se pudo cargar el resumen'); })
      .finally(() => { if (vigente) setIsLoading(false); });
    return () => { vigente = false; };
  }, [isOpen, historiaId]);

  if (!isOpen) return null;

  const r = datos?.resumen;
  let vacio: string | null = null;
  if (datos && !r) {
    vacio = !datos.disponible
      ? 'El resumen todavía no está disponible.'
      : datos.analisisSinResumen
        ? 'Hay un análisis de esta historia hecho antes de que existiera el resumen. Pide que lo abran una vez en Órdenes de la plataforma y vuelve a abrir esta ventana.'
        : datos.enCurso
          ? 'Estamos analizando los documentos que subió el paciente. Vuelve a abrir esta ventana en unos minutos.'
          : datos.fallo
            ? 'No se pudieron analizar los documentos que subió el paciente (por ejemplo, fotos que no se leen). Pídele que los envíe de nuevo.'
            : datos.documentosSinEnviar > 0
              ? 'El paciente subió documentos, pero todavía no los envió a análisis.'
              : 'El paciente todavía no ha subido su historia clínica.';
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-[#1f2c34] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-[#00a884]">Historia post-incapacidad</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition" aria-label="Cerrar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto text-sm text-gray-200">
          {isLoading && <p className="text-center text-gray-400 py-8">Cargando…</p>}
          {error && <p className="text-center text-red-400 py-8">No se pudo cargar el resumen: {error}</p>}
          {vacio && <p className="text-center text-gray-300 py-8">{vacio}</p>}

          {r && !isLoading && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Cifra valor={r.diasCertificados} etiqueta="días certificados" />
                <Cifra valor={r.soportes} etiqueta={`soportes (${r.soportesQueCertifican} certifican días)`} />
                <Cifra valor={r.diasSinSoporte} etiqueta="días sin soporte en el periodo" />
                {r.periodo && <Cifra valor={r.periodo.dias} etiqueta={`días entre ${r.periodo.desde} y ${r.periodo.hasta}`} />}
              </div>

              {(r.dia120 || r.dia180) && (
                <div className="mt-3 border-l-4 border-amber-500 bg-amber-500/10 rounded p-2 text-amber-200">
                  {r.dia180 ? 'Superó los 180 días de incapacidad.' : 'Superó los 120 días de incapacidad.'}
                </div>
              )}

              {r.diagnosticos?.length > 0 && (
                <Seccion titulo="Diagnósticos más frecuentes">
                  <ul className="list-disc pl-5 space-y-0.5">
                    {r.diagnosticos.map((d) => (
                      <li key={d.codigo}>
                        {d.codigo}{d.descripcion ? ` — ${d.descripcion}` : ''} ({d.soportes} soporte{d.soportes === 1 ? '' : 's'})
                      </li>
                    ))}
                  </ul>
                </Seccion>
              )}

              {r.tramos?.length > 0 && (
                <Seccion titulo="Periodos certificados">
                  <ul className="list-disc pl-5 space-y-0.5">{r.tramos.map((t, i) => <li key={i}>{tramo(t)}</li>)}</ul>
                </Seccion>
              )}

              {r.vacios?.length > 0 && (
                <Seccion titulo="Periodos sin soporte">
                  <ul className="list-disc pl-5 space-y-0.5">{r.vacios.map((t, i) => <li key={i}>{tramo(t)}</li>)}</ul>
                </Seccion>
              )}

              {(r.porNivel?.length > 0 || r.origenes?.length > 0 || r.prestadores?.length > 0) && (
                <Seccion titulo="Contexto">
                  <ul className="list-disc pl-5 space-y-0.5">
                    {r.porNivel?.length > 0 && (
                      <li>Nivel de atención: {r.porNivel.map((n) => `${n.nivel} ${n.dias} días`).join(', ')}</li>
                    )}
                    {r.origenes?.length > 0 && <li>Origen: {r.origenes.join(', ')}</li>}
                    {r.prestadores?.length > 0 && <li>Prestadores: {r.prestadores.join(', ')}</li>}
                  </ul>
                </Seccion>
              )}

              <Seccion titulo={r.alertas?.length ? `Puntos a verificar (${r.alertasTotal})` : 'Puntos a verificar'}>
                {!r.alertas?.length && <p>No se encontraron inconsistencias en los soportes.</p>}
                {r.alertas?.map((a, i) => (
                  <div key={i} className="border-l-4 border-amber-500 bg-amber-500/10 rounded p-2 mb-2">
                    <div className="font-semibold text-white">{a.titulo}</div>
                    {a.detalle && <div>{a.detalle}</div>}
                    {a.queHacer && <div className="text-amber-200 mt-0.5">Qué hacer: {a.queHacer}</div>}
                  </div>
                ))}
                {r.alertasTotal > (r.alertas?.length || 0) && (
                  <p className="text-xs text-gray-400">Y {r.alertasTotal - r.alertas.length} más en el análisis completo.</p>
                )}
              </Seccion>

              <p className="text-xs text-gray-400 mt-4">
                {datos?.origen === 'paciente' ? 'Documentos subidos por el paciente. ' : ''}
                {datos?.enCurso ? 'Hay documentos nuevos en análisis; este resumen se actualizará. ' : ''}
                {!datos?.enCurso && datos?.documentosSinEnviar ? `El paciente subió ${datos.documentosSinEnviar} documento(s) más que no ha enviado a análisis. ` : ''}
                {datos?.fallo ? 'El último análisis de documentos nuevos falló. ' : ''}
                Las cifras se calculan de los soportes; los puntos a verificar no prueban nada por sí solos: el concepto es del médico.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
