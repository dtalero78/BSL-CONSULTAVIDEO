import postgresService from './postgres.service';

export interface TenantConfig {
  id: string;
  nombre: string;
  logo_url: string | null;
  modulos_activos: string[];
}

// Cache en memoria con TTL de 60s
let cache: { data: Map<string, TenantConfig>; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

class TenantService {
  /**
   * Carga todos los tenants activos y los indexa por hostname
   */
  private async loadTenants(): Promise<Map<string, TenantConfig>> {
    const now = Date.now();
    if (cache && now - cache.timestamp < CACHE_TTL) {
      return cache.data;
    }

    const rows = await postgresService.query(
      `SELECT id, nombre, hostnames, config FROM tenants WHERE activo = true`
    );

    const map = new Map<string, TenantConfig>();
    if (rows) {
      for (const row of rows) {
        const tenantConfig: TenantConfig = {
          id: row.id,
          nombre: row.nombre,
          logo_url: row.config?.logo_url || null,
          modulos_activos: row.config?.modulos_activos || [],
        };
        // Indexar por cada hostname
        const hostnames: string[] = row.hostnames || [];
        for (const h of hostnames) {
          map.set(h.toLowerCase(), tenantConfig);
        }
        // También indexar por id
        map.set(`__id__${row.id}`, tenantConfig);
      }
    }

    cache = { data: map, timestamp: now };
    return map;
  }

  /**
   * Resuelve tenant por hostname. Fallback a BSL.
   */
  async getByHostname(hostname: string): Promise<TenantConfig> {
    const map = await this.loadTenants();
    const normalized = hostname.toLowerCase().replace(/:\d+$/, '');
    const tenant = map.get(normalized);
    if (tenant) return tenant;

    // Fallback a BSL
    const bsl = map.get('__id__bsl');
    if (bsl) return bsl;

    return { id: 'bsl', nombre: 'BSL Salud Ocupacional', logo_url: null, modulos_activos: [] };
  }

  /**
   * Resuelve tenant por id directamente
   */
  async getById(tenantId: string): Promise<TenantConfig> {
    const map = await this.loadTenants();
    const tenant = map.get(`__id__${tenantId}`);
    if (tenant) return tenant;
    return { id: 'bsl', nombre: 'BSL Salud Ocupacional', logo_url: null, modulos_activos: [] };
  }

  /**
   * Invalida cache manualmente
   */
  invalidateCache(): void {
    cache = null;
  }
}

export const tenantService = new TenantService();
export default tenantService;
