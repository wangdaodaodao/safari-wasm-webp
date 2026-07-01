# safari-wasm-webp

让 Safari 也能通过 Canvas 生成真正的 WebP 图片。

> 配套文章：[Safari 的 WebP 编码困局，一个 WASM 降级搞定](https://wangdaodao.com/posts/safari-cannot-upload-webp-solved/)

## 问题

Safari 的 `canvas.toBlob('image/webp')` 不可靠：

- 私密模式下，ITP 指纹保护导致检测误报
- 普通模式下，大图可能静默降级为 PNG
- 透明背景 PNG 截图导出后出现黑边

## 方案

三层兜底：

```
原生 toBlob（Chrome/Firefox）
  ↓ Safari 不支持
WASM 软编码器（281KB 本地托管）
  ↓ 极端情况失败
JPEG 降级
```

Chrome/Firefox 用户完全不下载 WASM，性能零损耗。

## 使用

把这几个文件放到你的静态资源目录下（必须同目录）：

```
safari-wasm-webp/
├── index.js          # 主入口，复制即用
├── webp-encoder.js   # Emscripten 包装层
├── webp_enc.js       # Emscripten 胶水代码
└── webp_enc.wasm     # WebP 编码器 (281KB)
```

**使用方式**：

```js
import { smartCanvasToWebP, warmup } from './safari-wasm-webp/index.js';

// 页面加载时预热，Safari 会在后台静默下载 WASM（Chrome/Firefox 跳过）
warmup();

// 把任意图片转成 Canvas 后，一行拿到 WebP Blob
async function convertToWebP(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);

  return smartCanvasToWebP(canvas, 0.85);
  // Chrome/Firefox → 原生 toBlob，零开销
  // Safari 私密/普通模式 → WASM 软编码
  // 极端失败 → JPEG 降级
}
```

## API

| 函数 | 说明 |
|------|------|
| `smartCanvasToWebP(canvas, quality)` | **推荐**。一键编码，原生 → WASM → JPEG 全自动降级 |
| `isWebPSupported()` | 异步检测原生 WebP 编码能力（toBlob 路径，Safari ITP 安全） |
| `canvasToWebP(canvas, quality)` | WASM 软编码，返回 WebP Blob，失败返回 null |
| `warmup()` | 提前下载 WASM，避免首张图片上传时的冷启动等待 |

## 原理

1. **toBlob 检测而非 toDataURL**：Safari ITP 对 toDataURL 注入指纹噪音导致误判。toBlob 不受此影响，真实反映编码能力
2. **WASM 软编码**：从 Squoosh 提取的 libwebp 编译产物，纯前端执行，无需后端
3. **并发锁**：WASM 模块全局单例，多图并发上传不会重复实例化

## 兼容性

| 浏览器 | 编码路径 | WebP 输出 |
|--------|----------|-----------|
| Chrome / Edge | 原生 toBlob | ✅ |
| Firefox | 原生 toBlob | ✅ |
| Safari 普通模式 | WASM 软编码 | ✅ |
| Safari 私密模式 | WASM 软编码 | ✅ |
| iOS Safari | WASM 软编码 | ✅ |

## 致谢

本项目 WAsidea 基于 [@jsquash/webp](https://github.com/jamsinclair/jSquash) 封装。jsquash 是优秀的 WASM 图片编解码集合，感谢上游作者的出色工作。

## 为什么不直接用 jsquash？

@jsquash/webp 提供了浏览器端的 WebP 编码能力，但直接用在生产环境有几个小痛点：

- **无预加载**：首次调用 `encode()` 才下载 WASM，用户感知数百 ms 白等
- **无并发锁**：多张图片同时处理会重复实例化 WASM 模块
- **无超时保护**：大图或慢设备上可能一直挂起
- **Safari 透明 PNG 黑边**：需要针对 Safari 做额外处理

本项目在上游编码能力之上，补齐了预热、并发控制、超时兜底和完整的降级链路，同时保持了对外完全兼容。

## 适用边界

**适合你**：静态站点 / 无 bundler 环境 / 需要在 Safari 下保证输出真正 WebP 的项目。把四个文件拖进目录，import 即用。

**用原包更合适**：如果你用 Vite / Webpack 已做好 wasm 资源管理，直接用 `@jsquash/webp` 即可——本项目做的就是帮你省掉那层基础设施。

## License

MIT
