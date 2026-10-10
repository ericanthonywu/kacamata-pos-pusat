/* app.js — Shared jQuery utilities & Base Path / Redirection */

// Prefix & Redirection helpers
(function () {
  function getPrefix() {
    if (typeof window.__APP_PREFIX__ === 'string' && window.__APP_PREFIX__) {
      return window.__APP_PREFIX__;
    }
    if (window.location.pathname.startsWith('/pontianak')) return '/pontianak';
    if (window.location.pathname.startsWith('/ketapang')) return '/ketapang';
    return '';
  }

  window.getAppPrefix = getPrefix;
  window.__APP_PREFIX__ = getPrefix();

  window.appUrl = function (path) {
    var prefix = window.getAppPrefix();
    if (!path) return prefix || '/';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) return path;
    if (!path.startsWith('/')) path = '/' + path;
    if (prefix && (path === prefix || path.startsWith(prefix + '/'))) return path;
    return prefix + path;
  };

  window.appRedirect = function (path) {
    window.location.href = window.appUrl(path);
  };
})();

// jQuery AJAX prefilter — ensures relative AJAX URLs work with prefix
if (typeof $ !== 'undefined' && $.ajaxPrefilter) {
  $.ajaxPrefilter(function (options) {
    var prefix = window.getAppPrefix ? window.getAppPrefix() : (window.__APP_PREFIX__ || '');
    if (prefix && options.url && options.url.startsWith('/') && !options.url.startsWith('//')) {
      if (!options.url.startsWith(prefix + '/') && options.url !== prefix) {
        options.url = prefix + options.url;
      }
    }
  });
}

// Global Link & Form Interceptor — ensures relative links and forms stay inside active prefix
if (typeof $ !== 'undefined') {
  $(document).on('click', 'a', function (e) {
    var href = $(this).attr('href');
    if (!href || href === '#' || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('tel:') || href.startsWith('mailto:')) return;
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return;
    var prefix = window.getAppPrefix ? window.getAppPrefix() : (window.__APP_PREFIX__ || '');
    if (prefix && href.startsWith('/') && !href.startsWith(prefix + '/') && href !== prefix) {
      if (href.startsWith('/ketapang') || href.startsWith('/pontianak')) return;
      e.preventDefault();
      window.location.href = prefix + href;
    }
  });

  $(document).on('submit', 'form', function () {
    var action = $(this).attr('action');
    if (!action || action === '#' || action.startsWith('http://') || action.startsWith('https://') || action.startsWith('//')) return;
    var prefix = window.getAppPrefix ? window.getAppPrefix() : (window.__APP_PREFIX__ || '');
    if (prefix && action.startsWith('/') && !action.startsWith(prefix + '/') && action !== prefix) {
      if (action.startsWith('/ketapang') || action.startsWith('/pontianak')) return;
      $(this).attr('action', prefix + action);
    }
  });
}

// DataTables Indonesian language
var dtLanguageID = {
  search: 'Cari:',
  lengthMenu: 'Tampilkan _MENU_ data',
  info: 'Menampilkan _START_ - _END_ dari _TOTAL_ data',
  infoEmpty: 'Tidak ada data',
  infoFiltered: '(difilter dari _MAX_ total data)',
  zeroRecords: 'Data tidak ditemukan',
  emptyTable: 'Tidak ada data tersedia',
  paginate: { first: 'Pertama', last: 'Terakhir', next: 'Berikutnya', previous: 'Sebelumnya' },
  buttons: {
    pageLength: {
      _: '%d baris',
      '-1': 'Semua data'
    }
  }
};

function escapeHtml(unsafe) {
  return (unsafe || '').toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Toast notification
function showToast(message, type) {
  type = type || 'success';
  var $toast = $('#appToast');
  $toast.removeClass('text-bg-success text-bg-danger text-bg-warning text-bg-info')
    .addClass('text-bg-' + type);
  $('#toastBody').text(message);
  var toast = bootstrap.Toast.getOrCreateInstance($toast[0], { delay: 3000 });
  toast.show();
}

async function printNotaData(d) {
  try {
    var dFormatDate = function (dStr) {
      if (!dStr) return '';
      var dt = new Date(dStr);
      return ('0' + dt.getDate()).slice(-2) + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()] + '-' + dt.getFullYear();
    };

    var orderDate = dFormatDate(d.order_date);
    var tglSelesai = dFormatDate(d.tanggal_selesai);

    var no = d.no_nota || '-';
    var nama = d.pelanggan_nama || '-';
    var telp = d.pelanggan_telp || '-';
    var sales = d.sales_nama || '-';

    var frameItem = (d.detail || []).find(function (i) { return i.tipe === 'frame'; });
    var lensaRItem = (d.detail || []).find(function (i) { return i.tipe === 'lensa_r'; });
    var lensaLItem = (d.detail || []).find(function (i) { return i.tipe === 'lensa_l'; });
    var aksesorisItem = (d.detail || []).find(function (i) { return i.tipe === 'aksesoris'; });
    var lainLainItems = (d.detail || []).filter(function (i) { return i.tipe === 'lain_lain'; });

    var subtotal = d.subtotal || d.total || 0;
    var total = d.total || 0;
    var dp = d.dp || 0;
    var sisa = total - dp;
    if (d.status_bayar === 'lunas') {
      dp = total;
      sisa = 0;
    }

    var W = 80; // total character width for full page (Epson LX-310 standard 10 CPI is 80 columns)
    var SP = '                                                                                                                                    ';
    var padRight = function (str, length) { return (str + SP).substring(0, length); };
    var padLeft = function (str, length) { return (SP + str).slice(-length); };
    var centerText = function (str, length) {
      var pad = Math.max(0, Math.floor((length - str.length) / 2));
      return padRight(SP.substring(0, pad) + str, length);
    };
    var separator = function (ch) { var s = ''; for (var i = 0; i < W; i++) s += ch; return s; };

    var lines = [];

    // Margin atas agar teks tidak terpotong di ujung kertas
    lines.push('');

    // Header: 3 columns
    lines.push(padRight('NO INVOICE:', 20) + centerText('OPTIK KACAMATA LENSA', W - 40) + padLeft('dikirim', 20));
    lines.push(padRight(no, 20) + centerText('JL.R.SUPRAPTO NO.41 KETAPANG', W - 40) + padLeft(orderDate, 20));
    lines.push(padRight('', 20) + centerText('TELP : 085350509540', W - 40) + padLeft('', 20));

    // Nama, Telp, Tgl Selesai
    var strTglSelesai = 'Tgl. Selesai : ' + tglSelesai;
    lines.push(padRight('Nama      : ' + nama, W - strTglSelesai.length) + strTglSelesai);
    lines.push('Telp      : ' + telp);
    lines.push(separator('-'));

    // Items
    var itemNum = 1;
    if (d.is_b2b) {
      (d.detail || []).forEach(function (item) {
        var catName = (item.kategori_nama || (item.tipe && item.tipe !== 'lain_lain' ? item.tipe : 'BARANG')).toUpperCase().replace(/_/g, ' ');
        if (catName.length > 9) catName = catName.substring(0, 9);
        var labelPrefix = itemNum + '. ' + padRight(catName + ':', 11);
        var namaItem = item.nama_barang || item.keterangan || '-';
        var subtotalItem = Number((item.harga || 0) * (item.jumlah || 1)).toLocaleString('id-ID');
        lines.push(padRight(labelPrefix + namaItem, W - 25) + padLeft('Rp ' + subtotalItem, 25));
        if (item.jumlah > 1) {
          lines.push(padRight('    (' + item.jumlah + ' pcs @ Rp ' + Number(item.harga || 0).toLocaleString('id-ID') + ')', W));
        }
        itemNum++;
      });
    } else {
      if (frameItem) {
        lines.push(padRight(itemNum + '. FRAME   : ' + (frameItem.nama_barang || '-'), W - 25) + padLeft('Rp ' + Number(frameItem.harga * frameItem.jumlah).toLocaleString('id-ID'), 25));
        itemNum++;
      }
      if (lensaRItem) {
        lines.push(padRight(itemNum + '. LENSA(R): ' + (lensaRItem.nama_barang || '-'), W - 25) + padLeft('Rp ' + Number(lensaRItem.harga * lensaRItem.jumlah).toLocaleString('id-ID'), 25));
        itemNum++;
      }
      if (lensaLItem) {
        lines.push(padRight(itemNum + '. LENSA(L): ' + (lensaLItem.nama_barang || '-'), W - 25) + padLeft('Rp ' + Number(lensaLItem.harga * lensaLItem.jumlah).toLocaleString('id-ID'), 25));
        itemNum++;
      }
      if (aksesorisItem) {
        lines.push(padRight(itemNum + '. AKSESORIS: ' + (aksesorisItem.nama_barang || '-'), W - 25) + padLeft('Rp ' + Number(aksesorisItem.harga * aksesorisItem.jumlah).toLocaleString('id-ID'), 25));
        itemNum++;
      }
      lainLainItems.forEach(function (item) {
        var catName = (item.kategori_nama || 'LAIN-LAIN').toUpperCase();
        if (catName.length > 9) catName = catName.substring(0, 9);
        var labelPrefix = itemNum + '. ' + padRight(catName + ':', 11);
        var namaItem = item.nama_barang || item.keterangan || '-';
        lines.push(padRight(labelPrefix + namaItem, W - 25) + padLeft('Rp ' + Number(item.harga * item.jumlah).toLocaleString('id-ID'), 25));
        itemNum++;
      });
    }

    // Totals (right-aligned)
    lines.push(padRight('', W - 45) + padRight('Jumlah', 22) + ': ' + padLeft('Rp ' + Number(subtotal).toLocaleString('id-ID'), 21));
    if (d.bpjs > 0) {
      lines.push(padRight('', W - 45) + padRight('BPJS', 22) + ': ' + padLeft('- Rp ' + Number(d.bpjs).toLocaleString('id-ID'), 21));
    }
    lines.push(padRight('', W - 45) + padRight('Uang Muka', 22) + ': ' + padLeft('Rp ' + Number(dp).toLocaleString('id-ID'), 21));
    lines.push(padRight('', W - 45) + padRight('Sisa', 22) + ': ' + padLeft('Rp ' + Number(sisa).toLocaleString('id-ID'), 21));
    if (d.metode_bayar) {
      lines.push(padRight('', W - 45) + padRight('Metode Bayar', 22) + ': ' + padLeft(d.metode_bayar.toUpperCase(), 21));
    }
    lines.push(separator('-'));

    // Detail section: left = frame/lensa info, right = no/sales/tgl
    function makeRow(leftText, rightText) {
      return padRight(leftText.substring(0, W - 35), W - 33) + rightText;
    }

    if (!d.is_b2b) {
      var frameText = 'Frame     : ' + (frameItem ? frameItem.nama_barang || '-' : '-');
      lines.push(makeRow(frameText, 'No.           : ' + no));

      var rResep = [d.sph_r ? 'SPH: ' + d.sph_r : '', d.cyl_r ? 'CYL: ' + d.cyl_r : '', d.axis_r ? 'AXIS: ' + d.axis_r : '', d.add_r ? 'ADD: ' + d.add_r : ''].filter(Boolean).join(' ');
      var lensaRText = 'Lensa (R) : ' + (lensaRItem ? lensaRItem.nama_barang || '-' : '-') + (rResep ? ' (' + rResep + ')' : '');
      lines.push(makeRow(lensaRText, 'Sales         : ' + sales));

      var lResep = [d.sph_l ? 'SPH: ' + d.sph_l : '', d.cyl_l ? 'CYL: ' + d.cyl_l : '', d.axis_l ? 'AXIS: ' + d.axis_l : '', d.add_l ? 'ADD: ' + d.add_l : ''].filter(Boolean).join(' ');
      var lensaLText = 'Lensa (L) : ' + (lensaLItem ? lensaLItem.nama_barang || '-' : '-') + (lResep ? ' (' + lResep + ')' : '');
      lines.push(makeRow(lensaLText, 'Tgl. Selesai  : ' + tglSelesai));

      var rSphStr = d.sph_r ? d.sph_r : '      ';
      var rCylStr = d.cyl_r ? d.cyl_r : '      ';
      var rAxisStr = d.axis_r ? d.axis_r : '      ';
      var rAddStr = d.add_r ? d.add_r : '      ';
      var lSphStr = d.sph_l ? d.sph_l : '      ';
      var lCylStr = d.cyl_l ? d.cyl_l : '      ';
      var lAxisStr = d.axis_l ? d.axis_l : '      ';
      var lAddStr = d.add_l ? d.add_l : '      ';

      if (d.sph_r || d.add_r || d.cyl_r || d.axis_r || d.sph_l || d.add_l || d.cyl_l || d.axis_l || d.pd) {
        if (d.sph_r || d.add_r || d.cyl_r || d.axis_r || d.sph_l || d.add_l || d.cyl_l || d.axis_l) {
          var pdStr = d.pd ? 'PD: ' + d.pd : '';
          lines.push('SPHR: ' + padRight(rSphStr, 10) + ' CYLR: ' + padRight(rCylStr, 10) + ' AXISR: ' + padRight(rAxisStr, 10) + ' ADDR: ' + padRight(rAddStr, 10) + pdStr);
          lines.push('SPHL: ' + padRight(lSphStr, 10) + ' CYLL: ' + padRight(lCylStr, 10) + ' AXISL: ' + padRight(lAxisStr, 10) + ' ADDL: ' + lAddStr);
        } else if (d.pd) {
          lines.push('PD  : ' + d.pd);
        }
      }
    } else {
      lines.push(makeRow('Jenis     : PENJUALAN TOKO (B2B)', 'No.           : ' + no));
      if (tglSelesai) {
        lines.push(makeRow('Jatuh Tempo: ' + tglSelesai, 'Tgl. Order    : ' + orderDate));
      }
    }

    var strDisetujui = 'Disetujui,';
    lines.push(padRight('', W - strDisetujui.length) + strDisetujui);
    lines.push('');
    lines.push('');
    lines.push('');
    var strTtd = '(...........)';
    lines.push(padRight('', W - strTtd.length) + strTtd);
    if (!d.is_b2b) {
      lines.push('SYARAT DAN KETENTUAN');
      lines.push('* KACAMATA YANG TIDAK DIAMBIL DALAM JANGKA WAKTU 2 BULAN MAKA UANG MUKA');
      lines.push('  AKAN DINYATAKAN HANGUS DAN DILUAR RESIKO KAMI');
    }

    // Siapkan raw text data dari baris-baris nota
    const textData = lines.join('\r\n') + '\r\n\r\n';
    const disableLocalPrint = localStorage.getItem('LOCAL_PRINT_SERVICE') === '0';
    const printHost = localStorage.getItem('print_service_host') || 'http://localhost:3000';
    const printerName = localStorage.getItem('raw_printer_name') || 'LX310';

    if (!disableLocalPrint) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;

      try {
        const response = await fetch(printHost + '/api/print', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: textData,
            printerName: printerName
          }),
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            showToast('Nota berhasil dikirim ke printer (' + printerName + ')!', 'success');
            return;
          }
          throw new Error(result.message || 'Gagal mencetak');
        } else {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || ('HTTP ' + response.status));
        }
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn('Local print service tidak aktif atau gagal:', err.message);
        showToast('Print service (localhost:3000) tidak aktif / gagal. Menggunakan cetak browser...', 'warning');
        printNotaBrowser(lines);
        return;
      }
    }

    // Jika local print service dinonaktifkan di localStorage, langsung cetak lewat browser
    printNotaBrowser(lines);
  } catch (err) {
    alert("Maaf, terjadi kesalahan saat memproses nota: " + err.message);
    console.error(err);
  }
}

function printNotaBrowser(lines) {
  const w = window.open('', '_blank', 'width=900,height=600');
  if (!w) {
    alert("Popup diblokir browser. Harap izinkan popup untuk mencetak nota.");
    return;
  }
  w.document.write('<html><head><title>Nota Penjualan</title><style>@page { size: portrait; margin: 0; } body { font-family: "Courier New", Courier, monospace; font-size: 12px; font-weight: 1000; white-space: pre; margin: 9mm 5mm 5mm 5mm; line-height: 1.2; }</style></head><body>' + lines.join('\n') + '</body></html>');
  w.document.close();
  setTimeout(() => { w.print(); }, 300);
}

// TSPL (TSC Programming Language) Formatter for Barcode Labels (73mm x 19mm)
function generateTsplBarcodes(items, format) {
  if (!items || !items.length) return '';
  format = format || 'double';

  var pairs = [];

  if (format === 'double') {
    // Each item is duplicated on both halves for the given quantity
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var qty = parseInt(it.jumlah, 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      for (var q = 0; q < qty; q++) {
        pairs.push({ left: it, right: it });
      }
    }
  } else {
    // Single: expand all items by qty, then pair sequentially
    var expanded = [];
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var count = parseInt(item.jumlah, 10);
      if (isNaN(count) || count < 1) count = 1;
      for (var k = 0; k < count; k++) {
        expanded.push(item);
      }
    }
    for (var m = 0; m < expanded.length; m += 2) {
      pairs.push({
        left: expanded[m],
        right: (m + 1 < expanded.length) ? expanded[m + 1] : null
      });
    }
  }

  if (pairs.length === 0) return '';

  var commands = [];
  commands.push('SIZE 73 mm, 19 mm');
  commands.push('GAP 2 mm, 0 mm');
  commands.push('DIRECTION 1');
  commands.push('REFERENCE 0,0');

  function sanitize(str) {
    return (str || '').toString().replace(/["\\]/g, '').replace(/[\r\n]/g, ' ').trim();
  }

  function renderHalf(item, startX) {
    if (!item) return [];
    var halfCmds = [];
    var rawName = (item.nama_barang || '-').toUpperCase();
    var cleanName = sanitize(rawName);
    var cleanBarcode = sanitize(item.barcode_id || '');
    var priceStr = '- Rp ' + Number(item.harga_jual || 0).toLocaleString('id-ID');

    // Name: font 2 (12x20) if short, font 1 (8x12) if long
    if (cleanName.length > 22) {
      halfCmds.push('TEXT ' + startX + ',14,"1",0,1,1,"' + cleanName.substring(0, 33) + '"');
    } else {
      halfCmds.push('TEXT ' + startX + ',10,"2",0,1,1,"' + cleanName.substring(0, 22) + '"');
    }

    // Barcode: Code 128
    if (cleanBarcode) {
      var approxWidth = (cleanBarcode.length + 3) * 11 + 15;
      var offset = 0;
      if (approxWidth < 270) {
        offset = Math.floor((270 - approxWidth) / 2);
      }
      var barcodeX = startX + offset;
      halfCmds.push('BARCODE ' + barcodeX + ',36,"128",48,0,0,1,1,"' + cleanBarcode + '"');
    }

    // Bottom line: barcode left, price right
    halfCmds.push('TEXT ' + startX + ',92,"1",0,1,1,"' + cleanBarcode + '"');
    var priceWidth = priceStr.length * 8;
    var priceX = Math.max(startX + 120, (startX + 270) - priceWidth);
    halfCmds.push('TEXT ' + priceX + ',92,"1",0,1,1,"' + priceStr + '"');

    return halfCmds;
  }

  for (var p = 0; p < pairs.length; p++) {
    var pair = pairs[p];
    commands.push('CLS');
    // Left half
    var leftCmds = renderHalf(pair.left, 16);
    for (var l = 0; l < leftCmds.length; l++) commands.push(leftCmds[l]);
    // Right half
    if (pair.right) {
      var rightCmds = renderHalf(pair.right, 312);
      for (var r = 0; r < rightCmds.length; r++) commands.push(rightCmds[r]);
    }
    commands.push('PRINT 1,1');
  }

  return commands.join('\r\n') + '\r\n';
}

// Fallback: Cetak Barcode via Browser (HTML dialog)
function printBarcodesBrowser(items, format) {
  format = format || 'double';

  function makeHalf(item) {
    var priceStr = '- Rp ' + Number(item.harga_jual || 0).toLocaleString('id-ID');
    return '<div class="half">' +
      '<div class="name">' + escapeHtml(item.nama_barang || '-') + '</div>' +
      '<div class="bc-wrapper"><svg class="bc" data-code="' + escapeHtml(item.barcode_id) + '"></svg></div>' +
      '<div class="bottom-info">' +
      '<span>' + escapeHtml(item.barcode_id) + '</span>' +
      '<span>' + priceStr + '</span>' +
      '</div>' +
      '</div>';
  }

  var labels = '';
  if (format === 'double') {
    items.forEach(function (item) {
      var halfHtml = makeHalf(item);
      for (var q = 0; q < (item.jumlah || 1); q++) {
        labels += '<div class="label">' + halfHtml + halfHtml + '</div>';
      }
    });
  } else {
    var allLabels = [];
    items.forEach(function (item) {
      for (var q = 0; q < (item.jumlah || 1); q++) {
        allLabels.push(item);
      }
    });
    for (var i = 0; i < allLabels.length; i += 2) {
      labels += '<div class="label">';
      labels += makeHalf(allLabels[i]);
      if (i + 1 < allLabels.length) {
        labels += makeHalf(allLabels[i + 1]);
      } else {
        labels += '<div class="half"></div>';
      }
      labels += '</div>';
    }
  }

  var w = window.open('', '_blank', 'width=600,height=400');
  if (!w) {
    alert("Popup diblokir browser. Harap izinkan popup untuk mencetak barcode.");
    return;
  }
  var html = [
    '<!DOCTYPE html>',
    '<html><head><title>Barcode</title>',
    '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>',
    '<style>',
    '@page { size: 73mm 19mm; margin: 0; }',
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body { background: #fff; color: #000; font-family: Arial, sans-serif; margin: 0; margin-top: -2px; }',
    '.label { width: 100%; height: 100vh; display: flex; page-break-after: always; }',
    '.half { width: 48%; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; padding: 0.5mm 2mm; overflow: hidden; }',
    '.label .half:first-child { margin-right: 4%; }',
    '.name { font-size: 6pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; text-align: left; margin-bottom: 0.5mm; }',
    '.bc-wrapper { display: flex; justify-content: center; align-items: center; overflow: hidden; height: 3mm; width: 30%; margin: 0 auto; }',
    'svg { display: block; max-height: 100%; }',
    '.bottom-info { display: flex; justify-content: space-between; font-size: 6pt; font-weight: normal; margin-top: 0.5mm; }',
    '</style></head><body>',
    labels,
    '<script>',
    'document.querySelectorAll(".bc").forEach(function(el) {',
    '  JsBarcode(el, el.dataset.code, { format: "CODE128", width: 1, height: 30, displayValue: false, margin: 0 });',
    '  var w = parseFloat(el.getAttribute("width")), h = parseFloat(el.getAttribute("height"));',
    '  if (w && h) { el.setAttribute("viewBox", "0 0 " + w + " " + h); el.removeAttribute("width"); el.removeAttribute("height"); el.setAttribute("preserveAspectRatio", "none"); el.style.width = "100%"; el.style.height = "100%"; }',
    '});',
    'window.onload = function() { setTimeout(function(){ window.print(); }, 500); };',
    '<\/script></body></html>'
  ].join('\n');
  w.document.write(html);
  w.document.close();
}

// Print barcode labels — shared by pembelian & barang
// items: [{ barcode_id, nama_barang, harga_jual, jumlah }]
// format: 'double' (same item on both halves) | 'single' (sequential left-right-left-right)
async function printBarcodesFromItems(items, format, btn) {
  format = format || 'double';
  var origHtml = null;
  if (btn) {
    origHtml = $(btn).html();
    $(btn).addClass('disabled').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Mencetak...');
  }

  try {
    const disableLocalPrint = localStorage.getItem('LOCAL_PRINT_SERVICE') === '0';
    const printHost = localStorage.getItem('print_service_host') || 'http://localhost:3000';
    const barcodePrinter = localStorage.getItem('barcode_printer_name') || 'BARCODE';

    if (!disableLocalPrint) {
      const tsplData = generateTsplBarcodes(items, format);
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

      try {
        const response = await fetch(printHost + '/api/print-barcode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: tsplData,
            items: items,
            format: format,
            printerName: barcodePrinter
          }),
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            showToast('Barcode berhasil dikirim ke printer (' + barcodePrinter + ')!', 'success');
            return;
          }
          throw new Error(result.message || 'Gagal mencetak barcode');
        } else {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || ('HTTP ' + response.status));
        }
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn('Local print service tidak aktif atau gagal:', err.message);

        // Jika error karena printer share tidak ditemukan di Windows, beri opsi ganti nama printer
        if (err.message && (err.message.toLowerCase().includes('printer') || err.message.toLowerCase().includes('share') || err.message.toLowerCase().includes('gagal'))) {
          var promptMsg = 'Gagal mencetak ke printer barcode "' + barcodePrinter + '".\n' +
                          'Pastikan printer sudah di-share di Windows dengan nama yang tepat.\n\n' +
                          'Masukkan nama share printer yang sesuai (atau batalkan untuk cetak browser):';
          var customName = prompt(promptMsg, barcodePrinter);
          if (customName && customName.trim() && customName.trim() !== barcodePrinter) {
            localStorage.setItem('barcode_printer_name', customName.trim());
            showToast('Nama printer disimpan: ' + customName.trim() + '. Mengirim ulang...', 'info');
            return await printBarcodesFromItems(items, format, btn);
          }
        }

        showToast('Print service (localhost:3000) tidak aktif / gagal. Menggunakan cetak browser...', 'warning');
        printBarcodesBrowser(items, format);
        return;
      }
    }

    // Jika local print service dinonaktifkan di localStorage, langsung cetak lewat browser
    printBarcodesBrowser(items, format);
  } finally {
    if (btn && origHtml !== null) {
      $(btn).removeClass('disabled').prop('disabled', false).html(origHtml);
    }
  }
}

// Global Printer Helpers & Modal Handlers
window.setBarcodePrinterName = function (name) {
  if (name) localStorage.setItem('barcode_printer_name', name.trim());
};
window.getBarcodePrinterName = function () {
  return localStorage.getItem('barcode_printer_name') || 'BARCODE';
};
window.setReceiptPrinterName = function (name) {
  if (name) localStorage.setItem('raw_printer_name', name.trim());
};
window.getReceiptPrinterName = function () {
  return localStorage.getItem('raw_printer_name') || 'LX310';
};

$(function () {
  // Buka Modal Pengaturan Printer
  $('#btnPrinterSettings').on('click', function () {
    var host = localStorage.getItem('print_service_host') || 'http://localhost:3000';
    var barcodePrinter = localStorage.getItem('barcode_printer_name') || 'BARCODE';
    var rawPrinter = localStorage.getItem('raw_printer_name') || 'LX310';
    var isEnabled = localStorage.getItem('LOCAL_PRINT_SERVICE') !== '0';

    $('#cfgPrintHost').val(host);
    $('#cfgBarcodePrinter').val(barcodePrinter);
    $('#cfgRawPrinter').val(rawPrinter);
    $('#cfgEnableLocalPrint').prop('checked', isEnabled);

    // Cek koneksi ke print service
    $('#badgePrintServiceStatus').removeClass('bg-success bg-danger').addClass('bg-secondary').text('Checking...');
    $('#printServiceStatusText').text('Memeriksa koneksi ke ' + host + '...');

    fetch(host + '/api/config', { method: 'GET', signal: AbortSignal.timeout(2500) })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.status === 'ok') {
          $('#badgePrintServiceStatus').removeClass('bg-secondary bg-danger').addClass('bg-success').text('Terhubung');
          $('#printServiceStatusText').text('kacamata-pos-print aktif (' + (data.service || 'Service OK') + ')');
          // Jika belum di-set di localStorage, isi dengan default dari service
          if (!localStorage.getItem('barcode_printer_name') && data.defaultBarcodePrinterName) {
            $('#cfgBarcodePrinter').val(data.defaultBarcodePrinterName);
          }
          if (!localStorage.getItem('raw_printer_name') && data.defaultPrinterName) {
            $('#cfgRawPrinter').val(data.defaultPrinterName);
          }
        } else {
          throw new Error('Respon tidak valid');
        }
      })
      .catch(function (err) {
        $('#badgePrintServiceStatus').removeClass('bg-secondary bg-success').addClass('bg-danger').text('Offline');
        $('#printServiceStatusText').text('Service tidak dapat dihubungi. Pastikan aplikasi print berjalan di latar belakang.');
      });

    var modal = new bootstrap.Modal(document.getElementById('modalPrinterSettings'));
    modal.show();
  });

  // Simpan Pengaturan Printer
  $('#btnSavePrinterSettings').on('click', function () {
    var host = ($('#cfgPrintHost').val() || 'http://localhost:3000').trim().replace(/\/+$/, '');
    var barcodePrinter = ($('#cfgBarcodePrinter').val() || 'BARCODE').trim();
    var rawPrinter = ($('#cfgRawPrinter').val() || 'LX310').trim();
    var isEnabled = $('#cfgEnableLocalPrint').is(':checked');

    localStorage.setItem('print_service_host', host);
    localStorage.setItem('barcode_printer_name', barcodePrinter);
    localStorage.setItem('raw_printer_name', rawPrinter);
    localStorage.setItem('LOCAL_PRINT_SERVICE', isEnabled ? '1' : '0');

    showToast('Pengaturan printer berhasil disimpan!', 'success');
    var modalEl = document.getElementById('modalPrinterSettings');
    var modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  });

  // Test Print Barcode
  $('#btnTestPrintBarcode').on('click', async function () {
    var btn = this;
    var host = ($('#cfgPrintHost').val() || 'http://localhost:3000').trim().replace(/\/+$/, '');
    var printer = ($('#cfgBarcodePrinter').val() || 'BARCODE').trim();

    var origHtml = $(btn).html();
    $(btn).addClass('disabled').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Testing...');

    var sampleItems = [
      { barcode_id: 'TEST-0001', nama_barang: 'TEST BARCODE OPTIK', harga_jual: 150000, jumlah: 1 }
    ];
    var tspl = generateTsplBarcodes(sampleItems, 'double');

    try {
      const res = await fetch(host + '/api/print-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: tspl,
          items: sampleItems,
          format: 'double',
          printerName: printer
        }),
        signal: AbortSignal.timeout(3500)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Test print barcode berhasil dikirim ke ' + printer + '!', 'success');
      } else {
        alert('Gagal test print: ' + (data.message || ('HTTP ' + res.status)));
      }
    } catch (err) {
      alert('Error saat mengirim test print: ' + err.message + '\nPastikan print service aktif dan printer di-share dengan nama "' + printer + '".');
    } finally {
      $(btn).removeClass('disabled').prop('disabled', false).html(origHtml);
    }
  });

  // Test Print Nota
  $('#btnTestPrintNota').on('click', async function () {
    var btn = this;
    var host = ($('#cfgPrintHost').val() || 'http://localhost:3000').trim().replace(/\/+$/, '');
    var printer = ($('#cfgRawPrinter').val() || 'LX310').trim();

    var origHtml = $(btn).html();
    $(btn).addClass('disabled').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Testing...');

    var testNota = 'TEST CETAK NOTA KACAMATA POS\r\n' +
                   '----------------------------------------\r\n' +
                   'Toko  : OPTIK KACAMATA LENSA PONTIANAK\r\n' +
                   'Status: PRINTER DOT MATRIX CONNECTED\r\n' +
                   '----------------------------------------\r\n\r\n\r\n\r\n';

    try {
      const res = await fetch(host + '/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testNota,
          printerName: printer
        }),
        signal: AbortSignal.timeout(3500)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Test print nota berhasil dikirim ke ' + printer + '!', 'success');
      } else {
        alert('Gagal test print nota: ' + (data.message || ('HTTP ' + res.status)));
      }
    } catch (err) {
      alert('Error saat mengirim test print: ' + err.message + '\nPastikan print service aktif dan printer di-share dengan nama "' + printer + '".');
    } finally {
      $(btn).removeClass('disabled').prop('disabled', false).html(origHtml);
    }
  });
});

// Loading button helpers — prevent double-click / spam
function setBtnLoading(btn) {
  var $b = $(btn);
  if ($b.prop('disabled')) return false; // already loading
  $b.data('orig-html', $b.html());
  $b.prop('disabled', true);
  $b.html('<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Memproses...');
  return true;
}
function resetBtn(btn) {
  var $b = $(btn);
  var orig = $b.data('orig-html');
  if (orig !== undefined) $b.html(orig);
  $b.prop('disabled', false);
}

// Confirm delete — used by all CRUD pages
var deleteUrl = null;
function confirmDelete(id, url) {
  deleteUrl = url;
  new bootstrap.Modal('#deleteModal').show();
}

$(function () {
  $('#deleteConfirmBtn').on('click', function () {
    if (!deleteUrl) return;
    var btn = this;
    if (!setBtnLoading(btn)) return;
    $.ajax({
      url: deleteUrl,
      method: 'DELETE',
      success: function (res) {
        if (res.success) location.reload();
        else { showToast(res.message || 'Gagal menghapus', 'danger'); resetBtn(btn); }
      },
      error: function (xhr) {
        showToast(xhr.responseJSON?.message || 'Gagal menghapus', 'danger');
        resetBtn(btn);
      },
    });
  });
});

// Format Rupiah
function fmtRp(value) {
  return 'Rp ' + Number(value || 0).toLocaleString('id-ID');
}

// Currency Input Handler
$(function () {
  function initCurrencyInput(input) {
    let name = input.attr('name');
    let hidden = input.siblings('.currency-hidden');
    if (name && hidden.length === 0) {
      input.removeAttr('name');
      hidden = $('<input type="hidden" class="currency-hidden" name="' + name + '">');
      input.after(hidden);
    }
    input.data('hidden-target', hidden);
    updateCurrencyInput(input);
  }

  function updateCurrencyInput(input) {
    let val = String(input.val() || '').replace(/[^0-9]/g, '');
    let hidden = input.data('hidden-target');

    if (val === '') {
      input.val('');
      if (hidden && hidden.length) hidden.val('0');
      input.data('raw-value', 0);
    } else {
      input.val(Number(val).toLocaleString('id-ID'));
      if (hidden && hidden.length) hidden.val(val);
      input.data('raw-value', val);
    }
  }

  // Init existing ones
  $('.input-currency').each(function () {
    initCurrencyInput($(this));
  });

  $(document).on('input', '.input-currency', function () {
    updateCurrencyInput($(this));
  });
});

// Sidebar Toggle Mobile
$(function() {
  $('#sidebarToggle').on('click', function() {
    $('.sidebar').addClass('show');
    $('#sidebarBackdrop').addClass('show');
  });

  $('#sidebarBackdrop').on('click', function() {
    $('.sidebar').removeClass('show');
    $('#sidebarBackdrop').removeClass('show');
  });
});
