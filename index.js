/**
 * 王导导
 * 2026-07-01 14:26:09
 * https://wangdaodao.me/2026/safari-cannot-upload-webp-solved/
 */

// ─── WebP 能力检测（toBlob 路径，Safari ITP 安全） ─────────────────────
let _supportWebP = null;
let _checkPromise = null;

export async function isWebPSupported() {
  if (_supportWebP !== null) return _supportWebP;
  if (!_checkPromise) {
    _checkPromise = new Promise(resolve => {
      try {
        const c = document.createElement('canvas');
        c.width = 2; c.height = 2;
        c.toBlob(blob => {
          _supportWebP = !!(blob && blob.type === 'image/webp');
          resolve(_supportWebP);
        }, 'image/webp', 0.9);
      } catch {
        _supportWebP = false;
        resolve(false);
      }
    });
  }
  return _checkPromise;
}

// ─── WASM 编码器（懒加载 + 并发锁）────────────────────────────────────
let _encoderReady = null;
let _encoder = null;

async function _ensureEncoder() {
  if (_encoder) return _encoder;
  if (!_encoderReady) {
    _encoderReady = (async () => {
      // webp-encoder.js 从同目录动态导入，WASM 路径由 Emscripten 相对寻址
      const mod = await import('./webp-encoder.js');
      await mod.init();
      _encoder = mod.default;
    })().catch(err => {
      _encoderReady = null; // 允许失败后重试
      throw err;
    });
  }
  await _encoderReady;
  return _encoder;
}

/**
 * 通过 WASM 将 Canvas 编码为 WebP Blob
 * @param {HTMLCanvasElement} canvas
 * @param {number} [quality=0.92] 0-1
 * @returns {Promise<Blob|null>} WebP Blob，失败返回 null
 */
export async function canvasToWebP(canvas, quality = 0.92) {
  if (!canvas) return null;
  try {
    const encode = await _ensureEncoder();
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = await encode(imageData, { quality: Math.round(quality * 100) });
    return new Blob([buffer], { type: 'image/webp' });
  } catch (e) {
    console.warn('[safari-wasm-webp] WASM 编码失败:', e);
    return null;
  }
}

/**
 * 智能编码：优先原生 toBlob，失败回退 WASM，再失败回退 JPEG
 * @param {HTMLCanvasElement} canvas
 * @param {number} [quality=0.85]
 * @returns {Promise<Blob>}
 */
export async function smartCanvasToWebP(canvas, quality = 0.85) {
  const supported = await isWebPSupported();

  if (supported) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('toBlob returned null'));
        // 静默降级检测：请求 WebP 但实际吐了 PNG
        if (blob.type === 'image/webp') return resolve(blob);
        // 降级发生了，走 WASM 或 JPEG
        _supportWebP = false;
        _fallbackResolve(canvas, quality, resolve);
      }, 'image/webp', quality);
    });
  }

  return _fallbackResolve(canvas, quality);
}

function _fallbackResolve(canvas, quality, resolve) {
  canvasToWebP(canvas, quality).then(blob => {
    if (blob) return resolve(blob);
    // WASM 也失败了，回退 JPEG
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

// ─── 预热（页面加载时调用，提前初始化 WASM）─────────────────────────
let _warmed = false;

export function warmup() {
  if (_warmed) return;
  _warmed = true;
  // 触发 WebP 检测
  isWebPSupported().then(supported => {
    if (!supported) {
      // 后台静默加载 WASM 编码器
      _ensureEncoder().catch(() => {});
    }
  });
}
