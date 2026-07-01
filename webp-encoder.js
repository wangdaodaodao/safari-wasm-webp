// 1. Meta / Configuration
export const label = 'WebP';
export const mimeType = 'image/webp';
export const extension = 'webp';

// These come from struct WebPConfig in encode.h.
export const defaultOptions = Object.freeze({
    quality: 75,
    target_size: 0,
    target_PSNR: 0,
    method: 4,
    sns_strength: 50,
    filter_strength: 60,
    filter_sharpness: 0,
    filter_type: 1,
    partitions: 0,
    segments: 4,
    pass: 1,
    show_compressed: 0,
    preprocessing: 0,
    autofilter: 0,
    partition_limit: 0,
    alpha_compression: 1,
    alpha_filtering: 1,
    alpha_quality: 100,
    lossless: 0,
    exact: 0,
    image_hint: 0,
    emulate_jpeg_size: 0,
    thread_level: 0,
    low_memory: 0,
    near_lossless: 100,
    use_delta_palette: 0,
    use_sharp_yuv: 0,
});

// 2. Utils
export function initEmscriptenModule(moduleFactory, wasmModule, moduleOptionOverrides = {}) {
    let instantiateWasm;
    if (wasmModule) {
        instantiateWasm = (imports, callback) => {
            const instance = new WebAssembly.Instance(wasmModule, imports);
            callback(instance);
            return instance.exports;
        };
    }
    return moduleFactory({
        // Just to be safe, don't automatically invoke any wasm functions
        noInitialRun: true,
        instantiateWasm,
        ...moduleOptionOverrides,
    });
}

// 3. Encoder
// ponytail: 采用简单的工厂函数闭包避免全局状态污染，支持多实例；若未来需求更复杂则可升级为 Class
export function createEncoder() {
  let emscriptenModule = null;

  async function init(module, moduleOptionOverrides) {
    if (!emscriptenModule) {
      emscriptenModule = (async () => {
        const webpEncoder = await import('./webp_enc.js');
        return initEmscriptenModule(webpEncoder.default, module, moduleOptionOverrides);
      })().catch(err => {
        emscriptenModule = null; // 允许重试
        throw err;
      });
    }
    return emscriptenModule;
  }

  async function encode(data, options = {}) {
    const { wasmModule, moduleOptionOverrides, ...encodeOptions } = options;
    if (!emscriptenModule) {
      emscriptenModule = init(wasmModule, moduleOptionOverrides);
    }
    const _options = { ...defaultOptions, ...encodeOptions };
    const module = await emscriptenModule;
    const result = module.encode(data.data, data.width, data.height, _options);
    if (!result) {
      const width = data?.width;
      const height = data?.height;
      const dataLength = data?.data?.length;
      throw new Error(`Encoding error: Failed to encode image to WebP (width: ${width}, height: ${height}, dataLength: ${dataLength}, options: ${JSON.stringify(_options)})`);
    }
    return result.buffer;
  }

  return { init, encode };
}

const defaultEncoder = createEncoder();

export const init = defaultEncoder.init;
export default defaultEncoder.encode;
