import { easeSine, overshoot, sceneExit, wordReveal } from './motion-easing';

export type BrowserRenderScene = { title: string; description: string; duration: number; color: string };
export type BrowserRenderAudio = {
  id: string;
  startTime: number;
  duration: number;
  trimStart: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  playbackRate: number;
  soundEffect: { id: string; name: string };
};

const DIMENSIONS: Record<string, [number, number]> = {
  '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1080, 1080], '4:5': [900, 1125],
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = candidate;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.length && lines.length === maxLines && lines.join(' ').length < words.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[. ]+$/, '')}…`;
  }
  return lines;
}

// Escadinha da skill de motion: palavra por palavra, entrando de baixo com blur → nítido.
// Depois de pousar o texto não se mexe. `ctx.filter` não existe em alguns navegadores (ex.: Safari);
// nesses o blur é simplesmente ignorado e a animação continua funcionando.
function drawWords(ctx: CanvasRenderingContext2D, lines: string[], centerX: number, baseY: number, lineHeight: number, local: number, scale: number, firstIndex = 0) {
  const space = ctx.measureText(' ').width;
  const baseAlpha = ctx.globalAlpha;
  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let index = firstIndex;
  lines.forEach((line, lineIndex) => {
    const words = line.split(' ').filter(Boolean);
    const widths = words.map(word => ctx.measureText(word).width);
    let x = centerX - (widths.reduce((sum, w) => sum + w, 0) + space * Math.max(0, words.length - 1)) / 2;
    words.forEach((word, wordIndex) => {
      const reveal = wordReveal(local, index++, { dy: 40 * scale, blur: 10 * scale });
      if (reveal.opacity > 0.003) {
        ctx.globalAlpha = baseAlpha * reveal.opacity;
        ctx.filter = reveal.blur > 0.3 ? `blur(${reveal.blur.toFixed(1)}px)` : 'none';
        ctx.fillText(word, x, baseY + lineIndex * lineHeight + reveal.offsetY);
      }
      x += widths[wordIndex] + space;
    });
  });
  ctx.filter = 'none';
  ctx.globalAlpha = baseAlpha;
  ctx.textAlign = previousAlign;
  return index;
}

function drawFrame(ctx: CanvasRenderingContext2D, width: number, height: number, scenes: BrowserRenderScene[], elapsed: number, total: number) {
  let sceneStart = 0;
  let index = scenes.length - 1;
  for (let i = 0; i < scenes.length; i++) {
    if (elapsed < sceneStart + scenes[i].duration || i === scenes.length - 1) { index = i; break; }
    sceneStart += scenes[i].duration;
  }
  const scene = scenes[index];
  const local = Math.max(0, elapsed - sceneStart);
  const progress = Math.max(0, Math.min(1, local / Math.max(scene.duration, 0.01)));
  const color = scene.color || '#6746ad';
  const scale = Math.min(width / 1280, height / 720);
  const centerX = width / 2;
  const centerY = height * 0.43;
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#100e17'); bg.addColorStop(0.48, '#21162a'); bg.addColorStop(1, '#0d1018');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, Math.min(width, height) * 0.47);
  glow.addColorStop(0, `${color}aa`); glow.addColorStop(0.35, `${color}30`); glow.addColorStop(1, '#12101a00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);

  const orbRadius = Math.min(width, height) * 0.095;
  ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(progress * 0.18);
  for (const [radius, alpha, rotation] of [[orbRadius * 2.05, 0.21, 1], [orbRadius * 2.55, 0.12, -1]] as const) {
    ctx.save(); ctx.rotate(progress * rotation);
    ctx.strokeStyle = `rgba(226,204,255,${alpha})`; ctx.lineWidth = Math.max(1, 1.3 * scale);
    ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.42, radius * 0.47, -0.35, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  const orb = ctx.createRadialGradient(-orbRadius * 0.3, -orbRadius * 0.35, orbRadius * 0.04, 0, 0, orbRadius * 1.2);
  orb.addColorStop(0, '#fff9ff'); orb.addColorStop(0.18, '#e8d3ff'); orb.addColorStop(0.57, color); orb.addColorStop(1, '#181320');
  ctx.shadowColor = color; ctx.shadowBlur = orbRadius * 0.9; ctx.fillStyle = orb; ctx.beginPath(); ctx.arc(0, 0, orbRadius * (0.92 + Math.sin(progress * Math.PI * 2) * 0.025) * (0.6 + 0.4 * overshoot(local / 0.6)), 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const copyY = height * 0.72;
  const maxWidth = width * 0.78;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
  ctx.fillStyle = '#d8b9ff'; ctx.font = `600 ${Math.max(11, Math.round(13 * scale))}px Arial, sans-serif`;
  ctx.fillText('REIMAGINE O POSSÍVEL', centerX, copyY - 45 * scale);
  ctx.fillStyle = '#fffaff'; ctx.font = `700 ${Math.max(28, Math.round(52 * scale))}px Arial, sans-serif`;
  const titleLines = wrapText(ctx, scene.title, maxWidth, 2);
  const exit = index < scenes.length - 1 ? sceneExit(local, scene.duration) : 1;
  ctx.save(); ctx.globalAlpha = exit;
  const wordsDrawn = drawWords(ctx, titleLines, centerX, copyY, 60 * scale, local, scale);
  ctx.fillStyle = '#e0d7e8'; ctx.font = `${Math.max(13, Math.round(19 * scale))}px Arial, sans-serif`;
  const descriptionLines = wrapText(ctx, scene.description, maxWidth, 3);
  ctx.globalAlpha = exit * easeSine((local - (0.12 + wordsDrawn * 0.08 + 0.2)) / 0.5);
  descriptionLines.forEach((line, i) => ctx.fillText(line, centerX, copyY + (titleLines.length - 1) * 60 * scale + 42 * scale + i * 26 * scale));
  ctx.restore();

  ctx.textAlign = 'left'; ctx.fillStyle = '#d2c4e1'; ctx.font = `600 ${Math.max(10, Math.round(12 * scale))}px Arial, sans-serif`;
  ctx.fillText('RECRIAR', width * 0.055, height * 0.93);
  ctx.fillStyle = '#ad91ce'; ctx.fillText('MOTION AI', width * 0.055 + 67 * scale, height * 0.93);
  ctx.textAlign = 'right'; ctx.fillStyle = '#b7aabd'; ctx.font = `${Math.max(10, Math.round(12 * scale))}px Arial, sans-serif`;
  ctx.fillText(`${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${(elapsed % 60).toFixed(1).padStart(4, '0')} / ${String(Math.floor(total / 60)).padStart(2, '0')}:${(total % 60).toFixed(1).padStart(4, '0')}`, width * 0.945, height * 0.93);
}

async function resolveAudioBuffer(clip: BrowserRenderAudio, audioContext: AudioContext) {
  const signedResponse = await fetch(`/api/sound-effects/${encodeURIComponent(clip.soundEffect.id)}/play`, { cache: 'no-store' });
  const signedData = await signedResponse.json().catch(() => ({}));
  if (!signedResponse.ok || typeof signedData.url !== 'string') throw new Error(signedData.error || `Não foi possível acessar o áudio “${clip.soundEffect.name}”.`);
  const audioResponse = await fetch(signedData.url);
  if (!audioResponse.ok) throw new Error(`Falha ao baixar o áudio “${clip.soundEffect.name}”.`);
  return audioContext.decodeAudioData(await audioResponse.arrayBuffer());
}

export async function renderMotionWebM(
  scenes: BrowserRenderScene[],
  aspect: string,
  audioClips: BrowserRenderAudio[],
  onProgress: (percent: number) => void,
): Promise<Blob> {
  if (!scenes.length) throw new Error('Adicione ao menos uma cena antes de renderizar.');
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('Este navegador não oferece gravação de vídeo. Tente Chrome, Edge ou Firefox atualizado.');
  const sceneTotal = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const total = Math.max(sceneTotal, ...audioClips.map(clip => clip.startTime + clip.duration));
  if (total <= 0 || total > 600) throw new Error('A duração da composição deve ser entre 0 e 10 minutos.');
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('Este navegador não consegue exportar WebM.');

  const [width, height] = DIMENSIONS[aspect] ?? DIMENSIONS['16:9'];
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível iniciar o canvas de renderização.');
  const canvasStream = canvas.captureStream(30);
  let audioContext: AudioContext | undefined;
  let destination: MediaStreamAudioDestinationNode | undefined;
  const sources: AudioBufferSourceNode[] = [];
  if (audioClips.length) {
    audioContext = new AudioContext();
    destination = audioContext.createMediaStreamDestination();
    try {
      const buffers = await Promise.all(audioClips.map(clip => resolveAudioBuffer(clip, audioContext!)));
      audioClips.forEach((clip, i) => {
        const buffer = buffers[i];
        const rate = Math.max(0.25, Math.min(4, clip.playbackRate || 1));
        const source = audioContext!.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
        const gain = audioContext!.createGain(); const start = Math.max(0, clip.startTime);
        const duration = Math.max(0.02, Math.min(clip.duration, (buffer.duration - clip.trimStart) / rate));
        const fadeIn = Math.min(clip.fadeIn, duration); const fadeOut = Math.min(clip.fadeOut, duration);
        gain.gain.setValueAtTime(0, audioContext!.currentTime + start);
        gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, clip.volume)), audioContext!.currentTime + start + Math.max(0.01, fadeIn));
        if (fadeOut > 0) gain.gain.setValueAtTime(Math.max(0, Math.min(1, clip.volume)), audioContext!.currentTime + start + Math.max(0, duration - fadeOut));
        gain.gain.linearRampToValueAtTime(0, audioContext!.currentTime + start + duration);
        source.connect(gain); gain.connect(destination!);
        source.start(audioContext!.currentTime + start, clip.trimStart, duration); sources.push(source);
      });
      for (const track of destination.stream.getAudioTracks()) canvasStream.addTrack(track);
      await audioContext.resume();
    } catch (error) {
      canvasStream.getTracks().forEach(track => track.stop());
      await audioContext.close().catch(() => {});
      throw error;
    }
  }

  const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener('error', () => reject(new Error('A gravação do vídeo foi interrompida pelo navegador.')));
    recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })));
  });
  recorder.start(250);
  const startedAt = performance.now();
  const frame = () => {
    const elapsed = Math.min(total, (performance.now() - startedAt) / 1000);
    drawFrame(context, width, height, scenes, elapsed, total);
    onProgress(Math.min(99, Math.floor((elapsed / total) * 100)));
    if (elapsed < total) requestAnimationFrame(frame);
    else {
      onProgress(100);
      window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 150);
    }
  };
  drawFrame(context, width, height, scenes, 0, total);
  requestAnimationFrame(frame);
  try {
    const blob = await stopped;
    if (blob.size < 1024) throw new Error('O arquivo renderizado ficou vazio. Tente novamente.');
    return blob;
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    sources.forEach(source => { try { source.stop(); } catch { /* already stopped */ } });
    canvasStream.getTracks().forEach(track => track.stop());
    await audioContext?.close().catch(() => {});
  }
}
