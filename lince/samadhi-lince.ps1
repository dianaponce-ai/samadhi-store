# ============================================================
# Samadhi Style · agente de Lince
# Corre en la PC del local (donde está Dragonfish), lee el stock
# y se lo manda a la tienda web. Programalo cada 15-30 minutos
# con el Programador de tareas de Windows (ver LEEME.txt).
# Los datos van en samadhi-lince.config.ps1, al lado de este archivo.
# ============================================================
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'samadhi-lince.config.ps1')
$log = Join-Path $here 'samadhi-lince.log'
function Log($m) { $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"; Write-Host $line; Add-Content -Path $log -Value $line -Encoding UTF8 }

try {
  $headers = @{ 'IdCliente' = $DragonfishIdCliente; 'Authorization' = $DragonfishToken }
  $filas = @(); $pagina = 1; $total = $null
  do {
    $r = Invoke-RestMethod -Uri "$DragonfishUrl/$DragonfishStockPath/?limit=200&page=$pagina" -Headers $headers -Method GET -TimeoutSec 60
    if ($null -eq $total) { $total = $r.TotalRegistros }
    $lote = @($r.Resultados)
    $filas += $lote
    $pagina++
  } while ($lote.Count -gt 0 -and $null -ne $total -and $filas.Count -lt $total)
  Log "Dragonfish: $($filas.Count) filas de stock."

  $body = @{ stock = $filas } | ConvertTo-Json -Depth 6 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $res = Invoke-RestMethod -Uri "$TiendaUrl/api/integrations/lince/stock" -Method POST -Body $bytes -ContentType 'application/json; charset=utf-8' -Headers @{ 'x-sync-secret' = $ClaveSincronizacion } -TimeoutSec 120
  Log "Tienda: $($res.updated) variantes actualizadas, $($res.unchanged) sin cambios, $($res.notFound) sin cruzar."
} catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}
