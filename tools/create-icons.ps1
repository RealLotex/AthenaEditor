# Raster versions of app/icon.svg for browser installation. No external tools.
Add-Type -AssemblyName System.Drawing
$iconRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\app'))
foreach ($size in @(192, 512)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#101216'))
    $graphics.ScaleTransform($size / 512.0, $size / 512.0)
    $points = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(256,106), [System.Drawing.PointF]::new(386,181),
        [System.Drawing.PointF]::new(386,331), [System.Drawing.PointF]::new(256,406),
        [System.Drawing.PointF]::new(126,331), [System.Drawing.PointF]::new(126,181)
    )
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#27384f'))
    $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#86b7ff'), 18)
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.FillPolygon($brush, $points)
    $graphics.DrawPolygon($pen, $points)
    $graphics.DrawLines($pen, [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(126,181), [System.Drawing.PointF]::new(256,256), [System.Drawing.PointF]::new(386,181)
    ))
    $graphics.DrawLine($pen, 256,256,256,406)
    $bitmap.Save((Join-Path $iconRoot "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose()
    $brush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
