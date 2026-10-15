const OUTPUT_WIDTH = 4961;

function cropCalendar(calendar, minTime, maxTime) {
  const clone = calendar.cloneNode(true);
  const offset = 0;
  const exportHeight = (maxTime - minTime) * 1.6;
  const shift = (element, clip = true) => {
    const top = Number.parseFloat(element.style.top) || 0;
    const height = Number.parseFloat(element.style.height) || 0;
    const bottom = top + height;
    if ((clip && (bottom <= offset || top >= offset + exportHeight)) ||
        (!clip && (top < offset || top > offset + exportHeight))) {
      element.remove();
      return;
    }
    element.style.top = `${(clip ? Math.max(top, offset) : top) - offset}px`;
    if (clip) {
      element.style.height = `${Math.min(bottom, offset + exportHeight) - Math.max(top, offset)}px`;
    }
  };

  clone.removeAttribute('id');
  clone.className = 'calendar png-calendar';
  clone.style.zoom = '1';
  for (const tick of clone.querySelectorAll('.tick')) {
    const top = Number.parseFloat(tick.style.top) || 0;
    if (top < offset || top > offset + exportHeight) tick.remove();
    else tick.style.top = `${top - offset}px`;
  }
  const axis = clone.querySelector('.axis');
  if (axis) {
    axis.style.height = `${exportHeight}px`;
    axis.style.position = 'relative';
  }
  for (const head of clone.querySelectorAll('.corner,.dayhead')) head.style.position = 'relative';
  for (const lane of clone.querySelectorAll('.lane')) {
    lane.style.height = `${exportHeight}px`;
    for (const line of lane.querySelectorAll('.hourline')) shift(line, false);
    for (const item of lane.querySelectorAll('.session,.session-gap')) shift(item);
  }
  const dayCount = clone.querySelectorAll('.lane').length;
  const width = 48 + dayCount * 238;
  clone.style.gridTemplateColumns = `48px repeat(${dayCount},238px)`;
  clone.style.width = `${width}px`;
  return {clone, width};
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Não foi possível criar o ficheiro PNG.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}

export async function exportCalendarPng({calendar, minTime, maxTime, roomName, notify, button}) {
  if (button) button.disabled = true;
  notify?.('A preparar o PNG…');
  let host;
  try {
    if (typeof window.html2canvas !== 'function') throw new Error('O exportador PNG não foi carregado.');
    const {clone, width} = cropCalendar(calendar, minTime, maxTime);
    host = document.createElement('section');
    host.style.cssText = `position:absolute;left:-100000px;top:0;width:${width}px;height:auto;overflow:visible;padding:24px;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;box-sizing:content-box;`;
    const heading = document.createElement('h1');
    heading.textContent = `Porto/Post/Doc 2026 — Grelha ${roomName}`;
    heading.style.cssText = 'margin:0 0 6px;font-size:26px;font-weight:800;line-height:1.2;';
    const note = document.createElement('p');
    const exportedAt = new Date();
    const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const hours = String(exportedAt.getHours()).padStart(2, '0');
    const minutes = String(exportedAt.getMinutes()).padStart(2, '0');
    const day = String(exportedAt.getDate()).padStart(2, '0');
    note.textContent = `Exportado às ${hours}:${minutes} do dia ${day} de ${months[exportedAt.getMonth()]}.`;
    note.style.cssText = 'margin:0 0 16px;font-size:15px;color:#555;';
    host.append(heading, note, clone);
    document.body.append(host);
    const captureWidth = width + 48;
    const captureHeight = Math.ceil(host.scrollHeight);
    const canvas = await window.html2canvas(host, {
      backgroundColor: '#ffffff',
      scale: OUTPUT_WIDTH / captureWidth,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      useCORS: true
    });
    const safeRoom = roomName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await downloadCanvas(canvas, `PPD26-Grelha-${safeRoom}.png`);
    notify?.('PNG exportado.');
  } catch (error) {
    console.error(error);
    notify?.('Não foi possível exportar o PNG.');
  } finally {
    host?.remove();
    if (button) button.disabled = false;
  }
}
