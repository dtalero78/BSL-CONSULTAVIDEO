import { useState, useEffect, createContext, useContext } from 'react';

export interface TenantConfig {
  id: string;
  nombre: string;
  logo_url: string | null;
  modulos_activos: string[];
}

const CACHE_KEY = 'bsl_tenant_config';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function getCached(): TenantConfig | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function setCache(config: TenantConfig): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

export const TenantContext = createContext<TenantConfig>({
  id: 'bsl',
  nombre: 'BSL Salud Ocupacional',
  logo_url: null,
  modulos_activos: [],
});

export function useTenant(): TenantConfig {
  return useContext(TenantContext);
}

/**
 * Hook interno para el provider — hace el fetch una sola vez.
 */
export function useTenantLoader(): TenantConfig {
  const [tenant, setTenant] = useState<TenantConfig>(() => {
    return getCached() || { id: 'bsl', nombre: 'BSL Salud Ocupacional', logo_url: null, modulos_activos: [] };
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/tenant/config`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(result => {
        if (result?.tenant) {
          setTenant(result.tenant);
          setCache(result.tenant);
        }
      })
      .catch(() => { /* usa cache */ });
  }, []);

  useEffect(() => {
    if (tenant?.nombre) {
      document.title = tenant.nombre;
    }
  }, [tenant?.nombre]);

  return tenant;
}
