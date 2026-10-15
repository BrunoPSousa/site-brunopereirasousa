const PAGE_WIDTH = 841.89; // A4 landscape, points
const PAGE_HEIGHT = 595.28;
const MARGIN = 14.17; // 0,5 cm
const RENDER_SCALE = 2;

function cropCalendar(calendar, minTime, maxTime, days) {
  const clone = calendar.cloneNode(true);
  const offset = 0;
  const exportHeight = (maxTime - minTime) * 1.6;
  const selectedDays = new Set(days);
  clone.removeAttribute('id');
  clone.style.zoom = '1';
  clone.style.width = `${48 + days.length * 238}px`;
  clone.style.gridTemplateColumns = `48px repeat(${days.length},238px)`;

  for (const head of clone.querySelectorAll('.dayhead')) {
    if (!selectedDays.has(head.querySelector('strong')?.textContent?.split(' ')[0])) head.remove();
    else head.style.position = 'relative';
  }
  const corner = clone.querySelector('.corner');
  if (corner) corner.style.position = 'relative';

  for (const tick of clone.querySelectorAll('.tick')) {
    const top = Number.parseFloat(tick.style.top) || 0;
    if (top < offset || top > offset + exportHeight) tick.remove();
    else tick.style.top = `${top - offset}px`;
  }
  const axis = clone.querySelector('.axis');
  if (axis) {
    axis.style.position = 'relative';
    axis.style.height = `${exportHeight}px`;
  }
  for (const lane of clone.querySelectorAll('.lane')) {
    if (!selectedDays.has(lane.dataset.day)) {
      lane.remove();
      continue;
    }
    lane.style.height = `${exportHeight}px`;
    for (const item of lane.querySelectorAll('.hourline,.session,.session-gap')) {
      const top = Number.parseFloat(item.style.top) || 0;
      const height = Number.parseFloat(item.style.height) || 0;
      const isLine = item.classList.contains('hourline');
      if ((isLine && (top < offset || top > offset + exportHeight)) ||
          (!isLine && (top + height <= offset || top >= offset + exportHeight))) {
        item.remove();
        continue;
      }
      item.style.top = `${Math.max(top, offset) - offset}px`;
      if (!isLine) item.style.height = `${Math.min(top + height, offset + exportHeight) - Math.max(top, offset)}px`;
    }
  }
  return clone;
}

function jpegFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('Não foi possível criar a imagem do PDF.'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', 0.94);
  });
}

export function buildPdf(pages) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const write = value => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (number, body) => {
    offsets[number] = length;
    write(`${number} 0 obj\n`);
    write(body);
    write('\nendobj\n');
  };
  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] >>`);
  pages.forEach((page, index) => {
    const pageNumber = 3 + index * 3;
    const contentNumber = pageNumber + 1;
    const imageNumber = pageNumber + 2;
    const ratio = Math.min((PAGE_WIDTH - 2 * MARGIN) / page.width, (PAGE_HEIGHT - 2 * MARGIN) / page.height);
    const width = page.width * ratio;
    const height = page.height * ratio;
    const x = (PAGE_WIDTH - width) / 2;
    const y = (PAGE_HEIGHT - height) / 2;
    const content = `q\n${width.toFixed(3)} 0 0 ${height.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im1 Do\nQ\n`;
    object(pageNumber, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im1 ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`);
    object(contentNumber, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    offsets[imageNumber] = length;
    write(`${imageNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    write(page.jpeg);
    write('\nendstream\nendobj\n');
  });
  const xrefOffset = length;
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let index = 1; index < offsets.length; index++) write(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new Blob(chunks, {type: 'application/pdf'});
}

export async function exportCalendarPdf({calendar, minTime, maxTime, roomName, notify, button}) {
  if (button) button.disabled = true;
  notify?.('A preparar o PDF…');
  let host;
  try {
    if (typeof window.html2canvas !== 'function') throw new Error('O exportador PDF não foi carregado.');
    const allDays = [...calendar.querySelectorAll('.lane')].map(lane => lane.dataset.day);
    if (!allDays.length) throw new Error('A grelha ainda não está disponível.');
    const exportedAt = new Date();
    const timestamp = new Intl.DateTimeFormat('pt-PT', {day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit'}).format(exportedAt);
    const clone = cropCalendar(calendar, minTime, maxTime, allDays);
    const width = 48 + allDays.length * 238;
    host = document.createElement('section');
    host.style.cssText = `position:absolute;left:-100000px;top:0;width:${width}px;height:auto;overflow:visible;padding:18px;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;box-sizing:content-box;`;
    const heading = document.createElement('h1');
    heading.textContent = `Porto/Post/Doc 2026 — Grelha ${roomName}`;
    heading.style.cssText = 'margin:0 0 4px;font-size:30px;font-weight:800;line-height:1.2;';
    const note = document.createElement('p');
    note.textContent = `Exportado às ${timestamp}.`;
    note.style.cssText = 'margin:0 0 12px;font-size:17px;color:#555;';
    host.append(heading, note, clone);
    document.body.append(host);
    const captureWidth = width + 36;
    const captureHeight = Math.ceil(host.scrollHeight);
    const canvas = await window.html2canvas(host, {
      backgroundColor:'#ffffff', scale:RENDER_SCALE, width:captureWidth,
      height:captureHeight, windowWidth:captureWidth, windowHeight:captureHeight,
      scrollX:0, scrollY:0, useCORS:true, logging:false
    });
    const page = {width:canvas.width, height:canvas.height, jpeg:await jpegFromCanvas(canvas)};
    host.remove();
    host = null;
    const url = URL.createObjectURL(buildPdf([page]));
    const link = document.createElement('a');
    const safeRoom = roomName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.href = url;
    link.download = `PPD26-Grelha-${safeRoom}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify?.('PDF exportado.');
  } catch (error) {
    console.error(error);
    notify?.('Não foi possível exportar o PDF.');
  } finally {
    host?.remove();
    if (button) button.disabled = false;
  }
}
