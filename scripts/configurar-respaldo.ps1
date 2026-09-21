# Configura el respaldo de Supabase de punta a punta. Se corre una sola vez:
#   .\scripts\configurar-respaldo.ps1
# Pide la clave service_role (oculta al escribir), la guarda como variable de usuario,
# hace un respaldo de prueba y, si sale bien, programa el respaldo semanal.

$clave = Read-Host 'Pegá la clave service_role de Supabase (no se muestra)' -AsSecureString
$plano = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave))
if ([string]::IsNullOrWhiteSpace($plano)) { Write-Error 'No se pegó ninguna clave.'; exit 1 }

[Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $plano, 'User')
$env:SUPABASE_SERVICE_ROLE_KEY = $plano

Write-Host "`nProbando el respaldo..." -ForegroundColor Cyan
node (Join-Path $PSScriptRoot 'respaldo-supabase.mjs')
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nEl respaldo de prueba falló; no programo nada. Revisá el mensaje de arriba." -ForegroundColor Red
  exit $LASTEXITCODE
}

& (Join-Path $PSScriptRoot 'programar-respaldo.ps1')
Write-Host "`nListo. Los respaldos quedan en BRAINKITCHEN\respaldos-varos\" -ForegroundColor Green
