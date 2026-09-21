# Respaldo de Supabase

Baja los datos de todas las tablas de `public` a archivos JSON, uno por tabla, en
`BRAINKITCHEN\respaldos-varos\AAAA-MM-DD_HHMM\`. Esa carpeta está dentro de OneDrive, así que
cada respaldo queda en el PC y en la nube. Se conservan los últimos 12.

## Puesta en marcha (una vez)

1. En Supabase: proyecto → **Settings → API Keys** → copiar la clave `service_role` (o la
   *secret key*). Es una llave maestra: no se pega en el chat, en el repo ni en `.env`.
2. Guardarla como variable de usuario de Windows (PowerShell):
   ```powershell
   [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'PEGAR_LA_CLAVE_AQUI', 'User')
   ```
   Cerrar y abrir la terminal después.
3. Probar a mano: `node scripts/respaldo-supabase.mjs`. Debe terminar con "N/N tablas respaldadas".
4. Programarlo, cada domingo 04:00: `.\scripts\programar-respaldo.ps1`

## Qué cubre y qué no

- **Cubre:** todas las filas de todas las tablas (socios, estrellas, reservas, carta, mesas…).
- **No cubre:** la estructura (tablas, policies, funciones) ni los usuarios de `auth.users`.
  La estructura está en `supabase/*.sql`, salvo funciones creadas solo en Postgres (como
  `register_visit`). Para esas, un `pg_dump --schema-only` con la contraseña de la base.
- El PC tiene que estar prendido el domingo; si estaba apagado, corre al prenderlo.

## Restaurar

Los JSON son filas tal cual. Para restaurar una tabla: Supabase → Table Editor → Import
data, o un `upsert` por API con la clave de servicio. Restaurar es manual a propósito.

## Ojo

Los archivos contienen datos personales de los socios. Están en tu OneDrive personal:
no compartir esa carpeta.
