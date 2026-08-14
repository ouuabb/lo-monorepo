/**
 * PluginUiMount.jsx —— 插件扩展点的 mountEl UI 挂载组件
 *
 * 挂载到自身容器，打开时经 pluginUi 桥在 isolated world 中执行插件 render，
 * 卸载时在同一 world 内执行 dispose（组件卸载即清理）。
 */
import { useEffect, useRef } from 'react';
import { openMount } from './pluginUi';

export default function PluginUiMount({ pluginId, extType, extId, onNotify, onError }) {
  const hostRef = useRef(null);
  const handleRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handle = await openMount({
          pluginId,
          extType,
          extId,
          container: hostRef.current,
          onNotify,
        });
        if (cancelled) {
          handle.close();
          return;
        }
        handleRef.current = handle;
      } catch (e) {
        if (!cancelled && onError) onError(e.message);
      }
    })();
    return () => {
      cancelled = true;
      if (handleRef.current) {
        const h = handleRef.current;
        handleRef.current = null;
        h.close();
      }
    };
    // onNotify/onError 由父级稳定持有
  }, [pluginId, extType, extId, onNotify, onError]);

  return <div className="plugin-mount-host" ref={hostRef} />;
}
