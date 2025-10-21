# Checklist de Despliegue Digital Ocean

Usa este checklist para asegurar un despliegue exitoso:

## Pre-Despliegue

- [ ] Tengo credenciales de Twilio listas:
  - [ ] TWILIO_ACCOUNT_SID
  - [ ] TWILIO_AUTH_TOKEN
  - [ ] TWILIO_API_KEY_SID
  - [ ] TWILIO_API_KEY_SECRET
- [ ] He generado un JWT_SECRET seguro
- [ ] El codigo esta commiteado en Git
- [ ] He pusheado a GitHub/GitLab
- [ ] Tengo una cuenta de Digital Ocean activa
- [ ] He conectado mi cuenta de GitHub/GitLab a Digital Ocean

## Durante el Despliegue

- [ ] He creado la App en Digital Ocean
- [ ] Digital Ocean detecto automaticamente `app.yaml`
- [ ] Veo dos componentes: `backend` y `frontend`
- [ ] He configurado todas las variables de entorno SECRET
- [ ] He clickeado "Create Resources"
- [ ] El build del backend comenzo (ver logs)
- [ ] El build del frontend comenzo (ver logs)
- [ ] Ambos builds completaron exitosamente
- [ ] Digital Ocean asigno URLs publicas

## Post-Despliegue

- [ ] He copiado la URL del frontend (ejemplo: `https://tu-app.ondigitalocean.app`)
- [ ] He actualizado `ALLOWED_ORIGINS` en backend con la URL del frontend
- [ ] He esperado a que el backend se redespliegue
- [ ] He probado el health check del backend:
  ```bash
  curl https://backend-tu-app.ondigitalocean.app/health
  ```
- [ ] He abierto el frontend en el navegador
- [ ] La pagina carga sin errores en la consola
- [ ] No hay errores de CORS
- [ ] Puedo crear una sala de video
- [ ] Puedo unirme a una sala de video
- [ ] El video funciona correctamente
- [ ] El audio funciona correctamente

## Configuracion Adicional (Opcional)

- [ ] He configurado un dominio personalizado
- [ ] He habilitado alertas de monitoreo
- [ ] He revisado los costos estimados
- [ ] He configurado backups automaticos (si aplica)
- [ ] He documentado las URLs de produccion

## Troubleshooting

Si algo fallo, verifica:

- [ ] Los logs del backend en Digital Ocean > Runtime Logs
- [ ] Los logs del frontend en Digital Ocean > Build Logs
- [ ] Las variables de entorno estan correctas
- [ ] CORS esta configurado correctamente
- [ ] El health check responde en `/health`

## Comandos Utiles

```bash
# Ver logs del backend
doctl apps logs <app-id> --component backend --follow

# Ver logs del frontend
doctl apps logs <app-id> --component frontend --follow

# Redesplegar manualmente
doctl apps create-deployment <app-id>

# Ver estado de la app
doctl apps get <app-id>
```

## Soporte

Si necesitas ayuda:
1. Lee [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
2. Revisa [MANUAL_SETUP.md](MANUAL_SETUP.md) para alternativas
3. Consulta [Digital Ocean Docs](https://docs.digitalocean.com/products/app-platform/)
4. Abre un ticket de soporte en Digital Ocean

---

**Nota**: Este checklist te ayudara a no olvidar ningun paso critico del despliegue.
