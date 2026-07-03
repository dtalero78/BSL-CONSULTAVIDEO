// ============================================================================
// bsl-plataforma-chat.service — proxy al chat de WhatsApp de bsl-plataforma.
//
// El inbound de WhatsApp del número +573153369631 lo recibe bsl-plataforma
// (webhook en bsl-plataforma.com → tenant 'bsl'). Por eso el chat del panel
// médico NO se lee de la BD local: se consulta la API de la plataforma
// (`/api/irischat/*`) autenticado como el tenant.
//
// Auth: login email+password (JWT 24h) → se cachea. Config por env:
//   BSL_PLATAFORMA_URL    (default https://bsl-plataforma.com → tenant por host)
//   BSL_PLATAFORMA_TENANT (default 'bsl')
//   BSL_PLATAFORMA_USER / BSL_PLATAFORMA_PASS (admin del tenant)
// ============================================================================

import axios, { AxiosInstance } from 'axios';

const BASE = (process.env.BSL_PLATAFORMA_URL || 'https://bsl-plataforma.com').replace(/\/+$/, '');
const TENANT = process.env.BSL_PLATAFORMA_TENANT || 'bsl';
const USER = process.env.BSL_PLATAFORMA_USER || '';
const PASS = process.env.BSL_PLATAFORMA_PASS || '';

export interface WaMensaje {
  id: number;
  direccion: 'entrante' | 'saliente';
  contenido: string;
  tipoMensaje: string;
  mediaUrl: string | null;
  createdAt: string;
}

function soloDigitos(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function mapMsg(m: any): WaMensaje {
  return {
    id: Number(m?.id ?? 0) || 0,
    direccion: m?.direccion === 'saliente' ? 'saliente' : 'entrante',
    contenido: m?.contenido ?? '',
    tipoMensaje: m?.tipo_mensaje ?? m?.tipoMensaje ?? 'text',
    mediaUrl: m?.media_url ?? m?.mediaUrl ?? null,
    createdAt: m?.timestamp ?? m?.created_at ?? m?.createdAt ?? new Date().toISOString(),
  };
}

class BslPlataformaChatService {
  private client: AxiosInstance;
  private token: string | null = null;
  private tokenExp = 0;

  constructor() {
    // baseURL = hostname del tenant → bsl-plataforma resuelve tenant por host.
    // Igual mandamos X-Tenant-Id como respaldo.
    this.client = axios.create({
      baseURL: BASE,
      timeout: 15000,
      headers: { 'X-Tenant-Id': TENANT },
    });
  }

  get configurado(): boolean {
    return !!USER && !!PASS;
  }

  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExp) return this.token;
    if (!this.configurado) {
      throw new Error('BSL_PLATAFORMA_USER / BSL_PLATAFORMA_PASS no configurados');
    }
    const res = await this.client.post('/api/auth/login', { email: USER, password: PASS });
    const token = res.data?.token;
    if (!token) throw new Error('Login a bsl-plataforma no devolvió token');
    this.token = token;
    this.tokenExp = Date.now() + 20 * 60 * 60 * 1000; // 20h (el JWT dura 24h)
    return token;
  }

  /** Ejecuta un request autenticado; reintenta una vez si el token expiró (401). */
  private async authed<T>(fn: (headers: Record<string, string>) => Promise<T>): Promise<T> {
    const token = await this.ensureToken();
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Id': TENANT };
    try {
      return await fn(headers);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        this.token = null;
        const t2 = await this.ensureToken();
        return fn({ Authorization: `Bearer ${t2}`, 'X-Tenant-Id': TENANT });
      }
      throw e;
    }
  }

  /** Resuelve la conversación (id + celular canónico) por número. null si no existe. */
  private async findConversacion(celular: string): Promise<{ id: number; celular: string } | null> {
    const target = soloDigitos(celular);
    const tail = target.slice(-10); // últimos 10 dígitos (ignora +57 / formatos)
    return this.authed(async (headers) => {
      const res = await this.client.get('/api/irischat/conversaciones', {
        headers,
        params: { search: tail },
      });
      const items: any[] = Array.isArray(res.data?.conversaciones) ? res.data.conversaciones : [];
      const match = items.find((c) => soloDigitos(c.celular).endsWith(tail));
      return match ? { id: Number(match.id), celular: String(match.celular) } : null;
    });
  }

  /** Hilo de mensajes por celular (vacío si no hay conversación). */
  async getMensajes(celular: string): Promise<{ celular: string; mensajes: WaMensaje[] }> {
    const conv = await this.findConversacion(celular);
    if (!conv) return { celular, mensajes: [] };
    return this.authed(async (headers) => {
      const res = await this.client.get(`/api/irischat/conversaciones/${conv.id}/mensajes`, {
        headers,
        params: { limit: 200 },
      });
      const raw: any[] = Array.isArray(res.data?.mensajes) ? res.data.mensajes : [];
      const mensajes = raw.filter((m) => m && m.id != null).map(mapMsg);
      return { celular: conv.celular, mensajes };
    });
  }

  /**
   * Responde al paciente vía bsl-plataforma (queda en el hilo del tenant).
   * Devuelve el mensaje guardado, o null si no hay conversación previa.
   */
  async sendReply(celular: string, texto: string): Promise<WaMensaje | null> {
    const conv = await this.findConversacion(celular);
    if (!conv) return null;
    return this.authed(async (headers) => {
      const res = await this.client.post(
        `/api/irischat/conversaciones/${conv.id}/mensajes`,
        { contenido: texto },
        { headers }
      );
      const m = res.data?.mensaje ?? res.data;
      return mapMsg({ ...m, direccion: 'saliente', contenido: m?.contenido ?? texto });
    });
  }
}

export const bslPlataformaChatService = new BslPlataformaChatService();
export default bslPlataformaChatService;
