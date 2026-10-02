# Measures a shadow in a captured frame and prints the numbers as JSON.
# Called by tools/ps2shadow.js; usable on its own for a one-off look.
#
# The scene is built so the parts are separable by brightness alone:
#   ground   a mid grey, lit
#   shadow   the decal, darker than that grey
#   caster   the mesh, brighter than the ground
#
# ALL pixel work happens in the compiled C# below, never in PowerShell. A
# 656x519 frame is 340,000 pixels and the analysis walks it three times; as
# PowerShell loops that took about 20 seconds per frame, which across a
# 27-case matrix was most of the run time. Compiled, it is under a tenth of a
# second. If you extend this, add to the C# - do not add a PowerShell loop.
#
# ASCII only: Windows PowerShell 5.1 reads .ps1 as ANSI.
param(
  [Parameter(Mandatory=$true)][string]$In,
  [int]$Top = 40,          # skip the title bar and the FPS overlay
  # The window frame around the client area is near-black and would otherwise
  # count as shadow - about 12000 pixels, comparable to the decal itself, and
  # being fixed in place it drags every centroid toward the frame centre.
  [int]$Left = 16,
  [int]$Right = 16,
  [int]$Bottom = 16,
  [int]$ShadowMax = 15,    # luma at or below this is shadow
  [int]$CasterMin = 70,    # luma at or above this is the caster
  [string]$Mask = "",      # optional: write a false-colour classification image
  # Mean luma over explicit rectangles, as "name:x,y,w,h;name2:...". A faint
  # shadow sits between the two thresholds, so the classifier cannot find it;
  # sampling where the shadow is known to be measures it without classifying.
  [string]$Boxes = ""
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

public class Meas {
  // BGRA in memory, so blue is at +0 and red at +2.
  static int Luma(byte[] b, int i) {
    return (int)(0.299 * b[i + 2] + 0.587 * b[i + 1] + 0.114 * b[i]);
  }

  // One accumulator per class: centroid, bounding box and the second moments
  // that give the principal axis.
  class Acc {
    public long n; public double sx, sy, sxx, syy, sxy;
    public int minx = int.MaxValue, maxx = -1, miny = int.MaxValue, maxy = -1;
    public void Add(int x, int y) {
      n++; sx += x; sy += y; sxx += (double)x * x; syy += (double)y * y; sxy += (double)x * y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }

  static string J(double v) { return v.ToString("0.##", CultureInfo.InvariantCulture); }

  static string Stats(Acc a, string extra) {
    if (a.n == 0) return "{\"n\":0}";
    double cx = a.sx / a.n, cy = a.sy / a.n;
    double vxx = a.sxx / a.n - cx * cx, vyy = a.syy / a.n - cy * cy, vxy = a.sxy / a.n - cx * cy;
    // Screen y grows downward; negate so the angle reads in normal maths
    // orientation, then callers map it to world axes themselves.
    double ang = 0.5 * Math.Atan2(2.0 * (-vxy), vxx - vyy) * 180.0 / Math.PI;
    double t = vxx + vyy;
    double d = Math.Sqrt(Math.Max(0.0, (vxx - vyy) * (vxx - vyy) + 4.0 * vxy * vxy));
    double l1 = (t + d) / 2.0, l2 = (t - d) / 2.0;
    var sb = new StringBuilder();
    sb.Append("{\"n\":").Append(a.n)
      .Append(",\"cx\":").Append(J(cx)).Append(",\"cy\":").Append(J(cy))
      .Append(",\"minx\":").Append(a.minx).Append(",\"maxx\":").Append(a.maxx)
      .Append(",\"miny\":").Append(a.miny).Append(",\"maxy\":").Append(a.maxy)
      .Append(",\"w\":").Append(a.maxx - a.minx + 1).Append(",\"h\":").Append(a.maxy - a.miny + 1)
      .Append(",\"angleDeg\":").Append(J(ang))
      .Append(",\"major\":").Append(J(2.0 * Math.Sqrt(Math.Max(0.0, l1))))
      .Append(",\"minor\":").Append(J(2.0 * Math.Sqrt(Math.Max(0.0, l2))));
    if (extra != null) sb.Append(extra);
    sb.Append("}");
    return sb.ToString();
  }

  public static string Run(string path, int top, int left, int right, int bottom,
                           int shadowMax, int casterMin, string boxes, string mask) {
    using (var bmp = (Bitmap)Image.FromFile(path)) {
      int W = bmp.Width, H = bmp.Height;
      var rect = new Rectangle(0, 0, W, H);
      var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      int stride = data.Stride;
      var bytes = new byte[stride * H];
      Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
      bmp.UnlockBits(data);

      int yEnd = H - bottom, xEnd = W - right;

      // ── find the rendered image inside the window ───────────────────
      //
      // The crop used to be four fixed numbers, which only worked while the
      // PCSX2 window happened to be the size it was the day they were picked.
      // Let it open larger and the letterbox around the render area - pure
      // black, tens of thousands of pixels - is classified as shadow, every
      // blob becomes a full-width band and every case in the matrix fails at
      // once. Running any other fixture is enough to change the window size,
      // because PCSX2 remembers it.
      //
      // The engine clears to a mid grey, so the rendered area is bounded by
      // the first row and column carrying a pixel brighter than black. The
      // search starts below `top` so the title bar's own text cannot anchor
      // it, and any edge that finds nothing keeps the value it was given.
      // A single bright pixel is not evidence of a rendered row: window
      // borders carry highlight lines a pixel wide. A twentieth of the span
      // is, and the decal never darkens a whole edge of the frame.
      const int frameMin = 20;      // above the letterbox, below the clear grey
      int needRow = Math.Max(8, (xEnd - left) / 20);
      int needCol = Math.Max(8, (yEnd - top) / 20);
      int t2 = -1, b2 = -1, l2 = -1, r2 = -1;
      for (int y = top; y < yEnd && t2 < 0; y++) {
        int n = 0;
        for (int x = left; x < xEnd; x++) if (Luma(bytes, y * stride + x * 4) >= frameMin) n++;
        if (n >= needRow) t2 = y;
      }
      for (int y = yEnd - 1; y >= top && b2 < 0; y--) {
        int n = 0;
        for (int x = left; x < xEnd; x++) if (Luma(bytes, y * stride + x * 4) >= frameMin) n++;
        if (n >= needRow) b2 = y + 1;
      }
      for (int x = left; x < xEnd && l2 < 0; x++) {
        int n = 0;
        for (int y = top; y < yEnd; y++) if (Luma(bytes, y * stride + x * 4) >= frameMin) n++;
        if (n >= needCol) l2 = x;
      }
      for (int x = xEnd - 1; x >= left && r2 < 0; x--) {
        int n = 0;
        for (int y = top; y < yEnd; y++) if (Luma(bytes, y * stride + x * 4) >= frameMin) n++;
        if (n >= needCol) r2 = x + 1;
      }

      // Only trust the detection when it found a plausible rectangle; a frame
      // that is genuinely all black must stay measurable rather than collapse.
      if (t2 >= 0 && b2 > t2 + 32 && l2 >= 0 && r2 > l2 + 32) {
        left = l2; xEnd = r2; yEnd = b2;
        // The FPS overlay is white text with a black outline, so it lands in
        // BOTH classes and drags the shadow's and the caster's bounding boxes
        // out to the left edge. It is drawn at (10, 10) of a 448-line frame,
        // so a twelfth of the render height clears it at any window size.
        top = t2 + (b2 - t2) / 12;
      }
      var luma = new byte[W * H];
      var shadow = new Acc(); var caster = new Acc(); var ground = new Acc();
      var hist = new long[256];
      double casterLumaSum = 0, casterLumaWx = 0;

      for (int y = top; y < yEnd; y++) {
        int row = y * stride;
        for (int x = left; x < xEnd; x++) {
          int i = row + x * 4;
          int l = (int)(0.299 * bytes[i + 2] + 0.587 * bytes[i + 1] + 0.114 * bytes[i]);
          luma[y * W + x] = (byte)l;
          hist[l]++;
          if (l <= shadowMax) shadow.Add(x, y);
          else if (l >= casterMin) { caster.Add(x, y); casterLumaSum += l; casterLumaWx += l * (double)x; }
          else ground.Add(x, y);
        }
      }

      // The frame's most common luma is the lit ground: it covers most of the
      // picture and its shading never changes between cases, which makes it a
      // stable reference to measure a shadow's darkness against.
      int mode = 0; long best = -1;
      for (int l = 0; l < 256; l++) if (hist[l] > best) { best = hist[l]; mode = l; }

      // Extent along and across the blob's own principal axis. major/minor
      // describe how the mass is spread rather than how far it reaches, so
      // they are not comparable between blobs of different shape; the bounding
      // box is only right when the blob is axis-aligned.
      string extra = null;
      if (shadow.n > 0) {
        double cx = shadow.sx / shadow.n, cy = shadow.sy / shadow.n;
        double vxx = shadow.sxx / shadow.n - cx * cx, vyy = shadow.syy / shadow.n - cy * cy;
        double vxy = shadow.sxy / shadow.n - cx * cy;
        double ang = 0.5 * Math.Atan2(2.0 * (-vxy), vxx - vyy);
        double ca = Math.Cos(-ang), sa = Math.Sin(-ang);
        var al = new List<double>((int)shadow.n); var ac = new List<double>((int)shadow.n);
        for (int y = top; y < yEnd; y++)
          for (int x = left; x < xEnd; x++)
            if (luma[y * W + x] <= shadowMax) {
              double dx = x - cx, dy = y - cy;
              al.Add(dx * ca + dy * sa); ac.Add(-dx * sa + dy * ca);
            }
        al.Sort(); ac.Sort();
        int lo = (int)(al.Count * 0.01), hi = Math.Min(al.Count - 1, (int)(al.Count * 0.99));
        extra = ",\"alongPx\":" + J(al[hi] - al[lo]) + ",\"acrossPx\":" + J(ac[hi] - ac[lo]);
      }

      var outp = new StringBuilder();
      outp.Append("{\"image\":\"").Append(System.IO.Path.GetFileName(path)).Append("\"")
          .Append(",\"width\":").Append(W).Append(",\"height\":").Append(H)
          .Append(",\"modeLuma\":").Append(mode)
          .Append(",\"shadow\":").Append(Stats(shadow, extra))
          .Append(",\"caster\":").Append(Stats(caster, null))
          .Append(",\"ground\":").Append(Stats(ground, null));

      // Which side of the caster is lit. The luma-weighted centroid needs no
      // threshold: the lit side of a curved caster is brighter, so it pulls
      // the weighted centre toward the light.
      if (caster.n > 0) {
        double midx = (caster.minx + caster.maxx) / 2.0;
        double sumL = 0, sumR = 0; long nL = 0, nR = 0;
        for (int y = caster.miny; y <= caster.maxy; y++)
          for (int x = caster.minx; x <= caster.maxx; x++) {
            int l = luma[y * W + x];
            if (l < casterMin) continue;
            if (x < midx) { sumL += l; nL++; } else { sumR += l; nR++; }
          }
        outp.Append(",\"casterLit\":{\"left\":").Append(J(nL > 0 ? sumL / nL : 0))
            .Append(",\"right\":").Append(J(nR > 0 ? sumR / nR : 0))
            .Append(",\"weightedCx\":").Append(J(casterLumaSum > 0 ? casterLumaWx / casterLumaSum : 0))
            .Append("}");
      }

      if (!string.IsNullOrEmpty(boxes)) {
        outp.Append(",\"boxes\":{");
        bool first = true;
        foreach (var spec in boxes.Split(';')) {
          if (spec.Trim().Length == 0) continue;
          var nv = spec.Split(':');
          var p = nv[1].Split(',');
          int bx = int.Parse(p[0]), by = int.Parse(p[1]), bw = int.Parse(p[2]), bh = int.Parse(p[3]);
          double sum = 0; long cnt = 0;
          for (int y = by; y < by + bh; y++) {
            if (y < 0 || y >= H) continue;
            for (int x = bx; x < bx + bw; x++) {
              if (x < 0 || x >= W) continue;
              int i = y * stride + x * 4;
              sum += 0.299 * bytes[i + 2] + 0.587 * bytes[i + 1] + 0.114 * bytes[i];
              cnt++;
            }
          }
          if (!first) outp.Append(",");
          first = false;
          outp.Append("\"").Append(nv[0]).Append("\":{\"mean\":")
              .Append(J(cnt > 0 ? sum / cnt : -1)).Append(",\"n\":").Append(cnt).Append("}");
        }
        outp.Append("}");
      }
      outp.Append("}");

      if (!string.IsNullOrEmpty(mask)) {
        using (var vis = new Bitmap(W, H)) {
          for (int y = top; y < yEnd; y++)
            for (int x = left; x < xEnd; x++) {
              int l = luma[y * W + x];
              Color c = l <= shadowMax ? Color.FromArgb(255, 40, 40)
                      : l >= casterMin ? Color.FromArgb(60, 200, 255)
                      : Color.FromArgb(40, 40, 40);
              vis.SetPixel(x, y, c);
            }
          vis.Save(mask, ImageFormat.Png);
        }
      }
      return outp.ToString();
    }
  }
}
'@

[Meas]::Run($In, $Top, $Left, $Right, $Bottom, $ShadowMax, $CasterMin, $Boxes, $Mask)
