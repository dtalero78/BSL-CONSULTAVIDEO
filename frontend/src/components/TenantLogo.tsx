import { useTenant } from '../hooks/useTenant';

interface TenantLogoProps {
  className?: string;
}

export function TenantLogo({ className = 'h-20 w-auto' }: TenantLogoProps) {
  const tenant = useTenant();
  const src = tenant.logo_url || '/logoBlanco.png';
  const alt = tenant.nombre || 'Logo';

  return <img src={src} alt={alt} className={className} />;
}
