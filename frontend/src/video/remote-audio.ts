/**
 * Elemento <audio> único por el que suena la voz del otro lado (Chime mezcla el
 * audio de toda la reunión en un solo stream).
 *
 * POR QUÉ EXISTE: varios navegadores de celular —sobre todo el navegador interno
 * que abre WhatsApp en Android (WebView) y Safari en iPhone— solo dejan sonar un
 * <audio> si su `play()` se llamó DENTRO de un toque del usuario. El `autoplay`
 * no basta. Entre el clic de "Unirse" y el momento en que Chime enlaza el audio
 * pasan varios segundos (carga del SDK, permiso de cámara/mic), así que ese
 * toque ya "se venció" y el navegador bloquea el sonido EN SILENCIO: el paciente
 * ve al médico pero no lo oye.
 *
 * Solución: crear el elemento y llamar `play()` en el MISMO clic de "Unirse"
 * (`primeRemoteAudio`). Un elemento desbloqueado así queda desbloqueado aunque
 * después le cambien el `srcObject`. El engine reutiliza este mismo elemento.
 *
 * Este módulo es liviano a propósito (no importa el SDK de Chime) para que la
 * página lo pueda llamar sincrónicamente desde el onClick.
 */
let sharedEl: HTMLAudioElement | null = null;

export function getRemoteAudioElement(): HTMLAudioElement {
  if (!sharedEl || !sharedEl.isConnected) {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.style.display = 'none';
    document.body.appendChild(el);
    sharedEl = el;
  }
  return sharedEl;
}

/**
 * Llamar SINCRÓNICAMENTE dentro del onClick/onKeyDown que hace entrar a la
 * llamada (sin `await` antes). Nunca lanza.
 */
export function primeRemoteAudio(): void {
  try {
    const el = getRemoteAudioElement();
    el.muted = false;
    // Sin fuente todavía, la promesa queda pendiente o se rechaza: da igual, lo
    // que importa es que el navegador registró el play() dentro del gesto.
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  } catch {
    /* nunca romper el clic de entrar */
  }
}
