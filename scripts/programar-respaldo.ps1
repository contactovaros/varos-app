# Registra en Windows una tarea semanal que corre el respaldo de Supabase.
# Uso (una sola vez, en PowerShell):  .\scripts\programar-respaldo.ps1
# Requisito: la variable de usuario SUPABASE_SERVICE_ROLE_KEY ya definida
# (ver instrucciones en scripts\README-respaldo.md).

$script = Join-Path $PSScriptRoot 'respaldo-supabase.mjs'
$node = (Get-Command node).Source

if (-not [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')) {
  Write-Error 'Falta la variable de usuario SUPABASE_SERVICE_ROLE_KEY. Definila primero.'
  exit 1
}

$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$script`""
# Domingo 04:00. StartWhenAvailable: si el PC estaba apagado, corre al prenderlo.
$cuando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 4:00am
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName 'Respaldo Supabase Varos' -Action $accion -Trigger $cuando `
  -Settings $ajustes -Description 'Respaldo semanal de datos de Supabase (Club Varo''s)' -Force
Write-Host 'Listo: se respalda cada domingo 04:00 (o al prender el PC si estaba apagado).'
