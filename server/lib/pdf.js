// PDF mínimo para la etiqueta de prueba (cuando Andreani está en modo prueba)
// y para el remito interno de preparación del pedido.
function esc(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\()]/g, (c) => '\\' + c);
}

export function simplePdf(lines, { width = 288, height = 432 } = {}) {
  // lines: [{ text, size, x, y, bold }]
  const content = lines
    .map((l) => `BT /${l.bold ? 'F2' : 'F1'} ${l.size || 10} Tf ${l.x} ${l.y} Td (${esc(l.text)}) Tj ET`)
    .join('\n');
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`);
  objs.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

export function makeLabelPdf(order) {
  const a = JSON.parse(order.shipping_address || '{}');
  const y0 = 400;
  const L = [
    { text: 'ETIQUETA DE PRUEBA - NO VALIDA PARA DESPACHO', size: 8, x: 20, y: y0, bold: true },
    { text: 'ANDREANI', size: 20, x: 20, y: y0 - 34, bold: true },
    { text: `Envio N. ${order.andreani_number}`, size: 12, x: 20, y: y0 - 56 },
    { text: `Pedido ${order.number}`, size: 10, x: 20, y: y0 - 72 },
    { text: 'DESTINATARIO', size: 8, x: 20, y: y0 - 104, bold: true },
    { text: order.name, size: 12, x: 20, y: y0 - 120 },
    { text: order.shipping_method === 'andreani_sucursal' ? `Retira en sucursal ${order.shipping_branch}` : `${a.calle || ''} ${a.numero || ''} ${a.piso ? 'Piso ' + a.piso : ''} ${a.depto || ''}`, size: 10, x: 20, y: y0 - 136 },
    { text: `${a.cp || ''} ${a.localidad || ''} ${a.provincia || ''}`, size: 10, x: 20, y: y0 - 150 },
    { text: `Tel. ${order.phone || '-'}  DNI ${order.dni || '-'}`, size: 10, x: 20, y: y0 - 164 },
    { text: 'REMITENTE', size: 8, x: 20, y: y0 - 196, bold: true },
    { text: 'Samadhi Style', size: 11, x: 20, y: y0 - 212 },
  ];
  return simplePdf(L);
}
